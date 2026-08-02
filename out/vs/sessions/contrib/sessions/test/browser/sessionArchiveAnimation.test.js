import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { createSessionArchiveAnimation } from "../../browser/views/sessionArchiveAnimation.js";
class TestAnimationHandle extends EventTarget {
  constructor() {
    super(...arguments);
    this.cancelled = false;
  }
  cancel() {
    this.cancelled = true;
    this.dispatchEvent(new Event("cancel"));
  }
  finish() {
    this.dispatchEvent(new Event("finish"));
  }
}
function setBounds(element, x, y, width, height) {
  element.getBoundingClientRect = () => new DOMRect(x, y, width, height);
}
suite("Sessions - SessionArchiveAnimation", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("lifts, folds, and lands at the archive action", async () => {
    const element = document.createElement("div");
    const overlayHost = document.createElement("div");
    setBounds(element, 10, 20, 300, 40);
    const animationHandles = [new TestAnimationHandle(), new TestAnimationHandle()];
    const createdAnimations = [];
    const animation = createSessionArchiveAnimation(element, { left: 286, top: 32, width: 16, height: 16 }, overlayHost, (_element, createdKeyframes, createdOptions) => {
      createdAnimations.push({ className: _element.className, left: _element.style.left, top: _element.style.top, keyframes: createdKeyframes, options: createdOptions });
      return animationHandles[createdAnimations.length - 1];
    });
    assert.ok(animation);
    store.add(animation);
    const pulseAttachedToOverlayHost = overlayHost.querySelector(".session-archive-catch-pulse")?.parentElement === overlayHost;
    animationHandles[0].finish();
    animationHandles[1].finish();
    await animation.finished;
    const beforeDispose = {
      hasAnimationClass: element.classList.contains("session-archive-animation"),
      transformOrigin: element.style.transformOrigin,
      pulseCount: overlayHost.querySelectorAll(".session-archive-catch-pulse").length,
      pulseAttachedToOverlayHost,
      createdAnimations,
      cancelled: animationHandles.map((handle) => handle.cancelled)
    };
    animation.dispose();
    assert.deepStrictEqual({
      beforeDispose,
      afterDispose: {
        hasAnimationClass: element.classList.contains("session-archive-animation"),
        transformOrigin: element.style.transformOrigin,
        pulseCount: overlayHost.querySelectorAll(".session-archive-catch-pulse").length,
        cancelled: animationHandles.map((handle) => handle.cancelled)
      }
    }, {
      beforeDispose: {
        hasAnimationClass: true,
        transformOrigin: "284px 20px",
        pulseCount: 0,
        pulseAttachedToOverlayHost: true,
        createdAnimations: [{
          className: "",
          left: "",
          top: "",
          keyframes: [
            { opacity: 1, transform: "translate3d(0, 0, 0) scale(1) rotate(0deg)" },
            { opacity: 1, transform: "translate3d(0, -1px, 0) scale(1.008) rotate(-0.25deg)", offset: 0.18 },
            { opacity: 0.88, transform: "translate3d(0, 0, 0) scale(0.98, 0.28) rotate(0.5deg)", offset: 0.62 },
            { opacity: 0, transform: "translate3d(0, 0, 0) scale(0.04) rotate(1deg)" }
          ],
          options: {
            duration: 240,
            easing: "cubic-bezier(0.4, 0, 0.2, 1)",
            fill: "forwards"
          }
        }, {
          className: "session-archive-catch-pulse",
          left: "294px",
          top: "40px",
          keyframes: [
            { opacity: 0, transform: "translate(-50%, -50%) scale(0.55)" },
            { opacity: 0.38, transform: "translate(-50%, -50%) scale(0.82)", offset: 0.35 },
            { opacity: 0, transform: "translate(-50%, -50%) scale(1.35)" }
          ],
          options: {
            delay: 110,
            duration: 150,
            easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
            fill: "both"
          }
        }],
        cancelled: [false, false]
      },
      afterDispose: {
        hasAnimationClass: false,
        transformOrigin: "",
        pulseCount: 0,
        cancelled: [true, true]
      }
    });
  });
  test("disposal settles pending motion and removes the landing ripple", async () => {
    const element = document.createElement("div");
    const overlayHost = document.createElement("div");
    setBounds(element, 10, 20, 300, 40);
    const animationHandles = [new TestAnimationHandle(), new TestAnimationHandle()];
    let animationIndex = 0;
    const animation = createSessionArchiveAnimation(element, { left: 286, top: 32, width: 16, height: 16 }, overlayHost, () => animationHandles[animationIndex++]);
    assert.ok(animation);
    animation.dispose();
    await animation.finished;
    assert.deepStrictEqual({
      hasAnimationClass: element.classList.contains("session-archive-animation"),
      transformOrigin: element.style.transformOrigin,
      pulseCount: overlayHost.querySelectorAll(".session-archive-catch-pulse").length,
      cancelled: animationHandles.map((handle) => handle.cancelled)
    }, {
      hasAnimationClass: false,
      transformOrigin: "",
      pulseCount: 0,
      cancelled: [true, true]
    });
  });
  test("restores the row when the landing ripple cannot start", () => {
    const element = document.createElement("div");
    const overlayHost = document.createElement("div");
    element.style.transformOrigin = "left top";
    setBounds(element, 10, 20, 300, 40);
    const rowAnimation = new TestAnimationHandle();
    let animationIndex = 0;
    assert.throws(() => createSessionArchiveAnimation(element, { left: 286, top: 32, width: 16, height: 16 }, overlayHost, () => {
      if (animationIndex++ === 0) {
        return rowAnimation;
      }
      throw new Error("Landing ripple failed");
    }), /Landing ripple failed/);
    assert.deepStrictEqual({
      hasAnimationClass: element.classList.contains("session-archive-animation"),
      transformOrigin: element.style.transformOrigin,
      pulseCount: overlayHost.querySelectorAll(".session-archive-catch-pulse").length,
      rowAnimationCancelled: rowAnimation.cancelled
    }, {
      hasAnimationClass: false,
      transformOrigin: "left top",
      pulseCount: 0,
      rowAnimationCancelled: true
    });
  });
  test("skips animation when the archive action is not rendered", () => {
    const element = document.createElement("div");
    const overlayHost = document.createElement("div");
    setBounds(element, 10, 20, 300, 40);
    let factoryCalled = false;
    const animation = createSessionArchiveAnimation(element, { left: 0, top: 0, width: 0, height: 0 }, overlayHost, () => {
      factoryCalled = true;
      return new TestAnimationHandle();
    });
    assert.deepStrictEqual({ animation, factoryCalled }, { animation: void 0, factoryCalled: false });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvdGVzdC9icm93c2VyL3Nlc3Npb25BcmNoaXZlQW5pbWF0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVNlc3Npb25BcmNoaXZlQW5pbWF0aW9uLCB0eXBlIElTZXNzaW9uQXJjaGl2ZUFuaW1hdGlvbkhhbmRsZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdmlld3Mvc2Vzc2lvbkFyY2hpdmVBbmltYXRpb24uanMnO1xuXG5jbGFzcyBUZXN0QW5pbWF0aW9uSGFuZGxlIGV4dGVuZHMgRXZlbnRUYXJnZXQgaW1wbGVtZW50cyBJU2Vzc2lvbkFyY2hpdmVBbmltYXRpb25IYW5kbGUge1xuXHRjYW5jZWxsZWQgPSBmYWxzZTtcblxuXHRjYW5jZWwoKTogdm9pZCB7XG5cdFx0dGhpcy5jYW5jZWxsZWQgPSB0cnVlO1xuXHRcdHRoaXMuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NhbmNlbCcpKTtcblx0fVxuXG5cdGZpbmlzaCgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdmaW5pc2gnKSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gc2V0Qm91bmRzKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCB4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0ZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QgPSAoKSA9PiBuZXcgRE9NUmVjdCh4LCB5LCB3aWR0aCwgaGVpZ2h0KTtcbn1cblxuc3VpdGUoJ1Nlc3Npb25zIC0gU2Vzc2lvbkFyY2hpdmVBbmltYXRpb24nLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbGlmdHMsIGZvbGRzLCBhbmQgbGFuZHMgYXQgdGhlIGFyY2hpdmUgYWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb25zdCBvdmVybGF5SG9zdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHNldEJvdW5kcyhlbGVtZW50LCAxMCwgMjAsIDMwMCwgNDApO1xuXG5cdFx0Y29uc3QgYW5pbWF0aW9uSGFuZGxlcyA9IFtuZXcgVGVzdEFuaW1hdGlvbkhhbmRsZSgpLCBuZXcgVGVzdEFuaW1hdGlvbkhhbmRsZSgpXTtcblx0XHRjb25zdCBjcmVhdGVkQW5pbWF0aW9uczogeyBjbGFzc05hbWU6IHN0cmluZzsgbGVmdDogc3RyaW5nOyB0b3A6IHN0cmluZzsga2V5ZnJhbWVzOiBLZXlmcmFtZVtdOyBvcHRpb25zOiBLZXlmcmFtZUFuaW1hdGlvbk9wdGlvbnMgfVtdID0gW107XG5cdFx0Y29uc3QgYW5pbWF0aW9uID0gY3JlYXRlU2Vzc2lvbkFyY2hpdmVBbmltYXRpb24oZWxlbWVudCwgeyBsZWZ0OiAyODYsIHRvcDogMzIsIHdpZHRoOiAxNiwgaGVpZ2h0OiAxNiB9LCBvdmVybGF5SG9zdCwgKF9lbGVtZW50LCBjcmVhdGVkS2V5ZnJhbWVzLCBjcmVhdGVkT3B0aW9ucykgPT4ge1xuXHRcdFx0Y3JlYXRlZEFuaW1hdGlvbnMucHVzaCh7IGNsYXNzTmFtZTogX2VsZW1lbnQuY2xhc3NOYW1lLCBsZWZ0OiBfZWxlbWVudC5zdHlsZS5sZWZ0LCB0b3A6IF9lbGVtZW50LnN0eWxlLnRvcCwga2V5ZnJhbWVzOiBjcmVhdGVkS2V5ZnJhbWVzLCBvcHRpb25zOiBjcmVhdGVkT3B0aW9ucyB9KTtcblx0XHRcdHJldHVybiBhbmltYXRpb25IYW5kbGVzW2NyZWF0ZWRBbmltYXRpb25zLmxlbmd0aCAtIDFdO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5vayhhbmltYXRpb24pO1xuXHRcdHN0b3JlLmFkZChhbmltYXRpb24pO1xuXHRcdGNvbnN0IHB1bHNlQXR0YWNoZWRUb092ZXJsYXlIb3N0ID0gb3ZlcmxheUhvc3QucXVlcnlTZWxlY3RvcignLnNlc3Npb24tYXJjaGl2ZS1jYXRjaC1wdWxzZScpPy5wYXJlbnRFbGVtZW50ID09PSBvdmVybGF5SG9zdDtcblxuXHRcdGFuaW1hdGlvbkhhbmRsZXNbMF0uZmluaXNoKCk7XG5cdFx0YW5pbWF0aW9uSGFuZGxlc1sxXS5maW5pc2goKTtcblx0XHRhd2FpdCBhbmltYXRpb24uZmluaXNoZWQ7XG5cdFx0Y29uc3QgYmVmb3JlRGlzcG9zZSA9IHtcblx0XHRcdGhhc0FuaW1hdGlvbkNsYXNzOiBlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnc2Vzc2lvbi1hcmNoaXZlLWFuaW1hdGlvbicpLFxuXHRcdFx0dHJhbnNmb3JtT3JpZ2luOiBlbGVtZW50LnN0eWxlLnRyYW5zZm9ybU9yaWdpbixcblx0XHRcdHB1bHNlQ291bnQ6IG92ZXJsYXlIb3N0LnF1ZXJ5U2VsZWN0b3JBbGwoJy5zZXNzaW9uLWFyY2hpdmUtY2F0Y2gtcHVsc2UnKS5sZW5ndGgsXG5cdFx0XHRwdWxzZUF0dGFjaGVkVG9PdmVybGF5SG9zdCxcblx0XHRcdGNyZWF0ZWRBbmltYXRpb25zLFxuXHRcdFx0Y2FuY2VsbGVkOiBhbmltYXRpb25IYW5kbGVzLm1hcChoYW5kbGUgPT4gaGFuZGxlLmNhbmNlbGxlZCksXG5cdFx0fTtcblxuXHRcdGFuaW1hdGlvbi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiZWZvcmVEaXNwb3NlLFxuXHRcdFx0YWZ0ZXJEaXNwb3NlOiB7XG5cdFx0XHRcdGhhc0FuaW1hdGlvbkNsYXNzOiBlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnc2Vzc2lvbi1hcmNoaXZlLWFuaW1hdGlvbicpLFxuXHRcdFx0XHR0cmFuc2Zvcm1PcmlnaW46IGVsZW1lbnQuc3R5bGUudHJhbnNmb3JtT3JpZ2luLFxuXHRcdFx0XHRwdWxzZUNvdW50OiBvdmVybGF5SG9zdC5xdWVyeVNlbGVjdG9yQWxsKCcuc2Vzc2lvbi1hcmNoaXZlLWNhdGNoLXB1bHNlJykubGVuZ3RoLFxuXHRcdFx0XHRjYW5jZWxsZWQ6IGFuaW1hdGlvbkhhbmRsZXMubWFwKGhhbmRsZSA9PiBoYW5kbGUuY2FuY2VsbGVkKSxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0YmVmb3JlRGlzcG9zZToge1xuXHRcdFx0XHRoYXNBbmltYXRpb25DbGFzczogdHJ1ZSxcblx0XHRcdFx0dHJhbnNmb3JtT3JpZ2luOiAnMjg0cHggMjBweCcsXG5cdFx0XHRcdHB1bHNlQ291bnQ6IDAsXG5cdFx0XHRcdHB1bHNlQXR0YWNoZWRUb092ZXJsYXlIb3N0OiB0cnVlLFxuXHRcdFx0XHRjcmVhdGVkQW5pbWF0aW9uczogW3tcblx0XHRcdFx0XHRjbGFzc05hbWU6ICcnLFxuXHRcdFx0XHRcdGxlZnQ6ICcnLFxuXHRcdFx0XHRcdHRvcDogJycsXG5cdFx0XHRcdFx0a2V5ZnJhbWVzOiBbXG5cdFx0XHRcdFx0XHR7IG9wYWNpdHk6IDEsIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZTNkKDAsIDAsIDApIHNjYWxlKDEpIHJvdGF0ZSgwZGVnKScgfSxcblx0XHRcdFx0XHRcdHsgb3BhY2l0eTogMSwgdHJhbnNmb3JtOiAndHJhbnNsYXRlM2QoMCwgLTFweCwgMCkgc2NhbGUoMS4wMDgpIHJvdGF0ZSgtMC4yNWRlZyknLCBvZmZzZXQ6IDAuMTggfSxcblx0XHRcdFx0XHRcdHsgb3BhY2l0eTogMC44OCwgdHJhbnNmb3JtOiAndHJhbnNsYXRlM2QoMCwgMCwgMCkgc2NhbGUoMC45OCwgMC4yOCkgcm90YXRlKDAuNWRlZyknLCBvZmZzZXQ6IDAuNjIgfSxcblx0XHRcdFx0XHRcdHsgb3BhY2l0eTogMCwgdHJhbnNmb3JtOiAndHJhbnNsYXRlM2QoMCwgMCwgMCkgc2NhbGUoMC4wNCkgcm90YXRlKDFkZWcpJyB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0ZHVyYXRpb246IDI0MCxcblx0XHRcdFx0XHRcdGVhc2luZzogJ2N1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSknLFxuXHRcdFx0XHRcdFx0ZmlsbDogJ2ZvcndhcmRzJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0Y2xhc3NOYW1lOiAnc2Vzc2lvbi1hcmNoaXZlLWNhdGNoLXB1bHNlJyxcblx0XHRcdFx0XHRsZWZ0OiAnMjk0cHgnLFxuXHRcdFx0XHRcdHRvcDogJzQwcHgnLFxuXHRcdFx0XHRcdGtleWZyYW1lczogW1xuXHRcdFx0XHRcdFx0eyBvcGFjaXR5OiAwLCB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSkgc2NhbGUoMC41NSknIH0sXG5cdFx0XHRcdFx0XHR7IG9wYWNpdHk6IDAuMzgsIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKSBzY2FsZSgwLjgyKScsIG9mZnNldDogMC4zNSB9LFxuXHRcdFx0XHRcdFx0eyBvcGFjaXR5OiAwLCB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSkgc2NhbGUoMS4zNSknIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRkZWxheTogMTEwLFxuXHRcdFx0XHRcdFx0ZHVyYXRpb246IDE1MCxcblx0XHRcdFx0XHRcdGVhc2luZzogJ2N1YmljLWJlemllcigwLjIsIDAuOCwgMC4yLCAxKScsXG5cdFx0XHRcdFx0XHRmaWxsOiAnYm90aCcsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdGNhbmNlbGxlZDogW2ZhbHNlLCBmYWxzZV0sXG5cdFx0XHR9LFxuXHRcdFx0YWZ0ZXJEaXNwb3NlOiB7XG5cdFx0XHRcdGhhc0FuaW1hdGlvbkNsYXNzOiBmYWxzZSxcblx0XHRcdFx0dHJhbnNmb3JtT3JpZ2luOiAnJyxcblx0XHRcdFx0cHVsc2VDb3VudDogMCxcblx0XHRcdFx0Y2FuY2VsbGVkOiBbdHJ1ZSwgdHJ1ZV0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NhbCBzZXR0bGVzIHBlbmRpbmcgbW90aW9uIGFuZCByZW1vdmVzIHRoZSBsYW5kaW5nIHJpcHBsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29uc3Qgb3ZlcmxheUhvc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRzZXRCb3VuZHMoZWxlbWVudCwgMTAsIDIwLCAzMDAsIDQwKTtcblx0XHRjb25zdCBhbmltYXRpb25IYW5kbGVzID0gW25ldyBUZXN0QW5pbWF0aW9uSGFuZGxlKCksIG5ldyBUZXN0QW5pbWF0aW9uSGFuZGxlKCldO1xuXHRcdGxldCBhbmltYXRpb25JbmRleCA9IDA7XG5cdFx0Y29uc3QgYW5pbWF0aW9uID0gY3JlYXRlU2Vzc2lvbkFyY2hpdmVBbmltYXRpb24oZWxlbWVudCwgeyBsZWZ0OiAyODYsIHRvcDogMzIsIHdpZHRoOiAxNiwgaGVpZ2h0OiAxNiB9LCBvdmVybGF5SG9zdCwgKCkgPT4gYW5pbWF0aW9uSGFuZGxlc1thbmltYXRpb25JbmRleCsrXSk7XG5cdFx0YXNzZXJ0Lm9rKGFuaW1hdGlvbik7XG5cblx0XHRhbmltYXRpb24uZGlzcG9zZSgpO1xuXHRcdGF3YWl0IGFuaW1hdGlvbi5maW5pc2hlZDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzQW5pbWF0aW9uQ2xhc3M6IGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdzZXNzaW9uLWFyY2hpdmUtYW5pbWF0aW9uJyksXG5cdFx0XHR0cmFuc2Zvcm1PcmlnaW46IGVsZW1lbnQuc3R5bGUudHJhbnNmb3JtT3JpZ2luLFxuXHRcdFx0cHVsc2VDb3VudDogb3ZlcmxheUhvc3QucXVlcnlTZWxlY3RvckFsbCgnLnNlc3Npb24tYXJjaGl2ZS1jYXRjaC1wdWxzZScpLmxlbmd0aCxcblx0XHRcdGNhbmNlbGxlZDogYW5pbWF0aW9uSGFuZGxlcy5tYXAoaGFuZGxlID0+IGhhbmRsZS5jYW5jZWxsZWQpLFxuXHRcdH0sIHtcblx0XHRcdGhhc0FuaW1hdGlvbkNsYXNzOiBmYWxzZSxcblx0XHRcdHRyYW5zZm9ybU9yaWdpbjogJycsXG5cdFx0XHRwdWxzZUNvdW50OiAwLFxuXHRcdFx0Y2FuY2VsbGVkOiBbdHJ1ZSwgdHJ1ZV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIHRoZSByb3cgd2hlbiB0aGUgbGFuZGluZyByaXBwbGUgY2Fubm90IHN0YXJ0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb25zdCBvdmVybGF5SG9zdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGVsZW1lbnQuc3R5bGUudHJhbnNmb3JtT3JpZ2luID0gJ2xlZnQgdG9wJztcblx0XHRzZXRCb3VuZHMoZWxlbWVudCwgMTAsIDIwLCAzMDAsIDQwKTtcblx0XHRjb25zdCByb3dBbmltYXRpb24gPSBuZXcgVGVzdEFuaW1hdGlvbkhhbmRsZSgpO1xuXHRcdGxldCBhbmltYXRpb25JbmRleCA9IDA7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGNyZWF0ZVNlc3Npb25BcmNoaXZlQW5pbWF0aW9uKGVsZW1lbnQsIHsgbGVmdDogMjg2LCB0b3A6IDMyLCB3aWR0aDogMTYsIGhlaWdodDogMTYgfSwgb3ZlcmxheUhvc3QsICgpID0+IHtcblx0XHRcdGlmIChhbmltYXRpb25JbmRleCsrID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiByb3dBbmltYXRpb247XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0xhbmRpbmcgcmlwcGxlIGZhaWxlZCcpO1xuXHRcdH0pLCAvTGFuZGluZyByaXBwbGUgZmFpbGVkLyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhhc0FuaW1hdGlvbkNsYXNzOiBlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnc2Vzc2lvbi1hcmNoaXZlLWFuaW1hdGlvbicpLFxuXHRcdFx0dHJhbnNmb3JtT3JpZ2luOiBlbGVtZW50LnN0eWxlLnRyYW5zZm9ybU9yaWdpbixcblx0XHRcdHB1bHNlQ291bnQ6IG92ZXJsYXlIb3N0LnF1ZXJ5U2VsZWN0b3JBbGwoJy5zZXNzaW9uLWFyY2hpdmUtY2F0Y2gtcHVsc2UnKS5sZW5ndGgsXG5cdFx0XHRyb3dBbmltYXRpb25DYW5jZWxsZWQ6IHJvd0FuaW1hdGlvbi5jYW5jZWxsZWQsXG5cdFx0fSwge1xuXHRcdFx0aGFzQW5pbWF0aW9uQ2xhc3M6IGZhbHNlLFxuXHRcdFx0dHJhbnNmb3JtT3JpZ2luOiAnbGVmdCB0b3AnLFxuXHRcdFx0cHVsc2VDb3VudDogMCxcblx0XHRcdHJvd0FuaW1hdGlvbkNhbmNlbGxlZDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgYW5pbWF0aW9uIHdoZW4gdGhlIGFyY2hpdmUgYWN0aW9uIGlzIG5vdCByZW5kZXJlZCcsICgpID0+IHtcblx0XHRjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29uc3Qgb3ZlcmxheUhvc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRzZXRCb3VuZHMoZWxlbWVudCwgMTAsIDIwLCAzMDAsIDQwKTtcblx0XHRsZXQgZmFjdG9yeUNhbGxlZCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgYW5pbWF0aW9uID0gY3JlYXRlU2Vzc2lvbkFyY2hpdmVBbmltYXRpb24oZWxlbWVudCwgeyBsZWZ0OiAwLCB0b3A6IDAsIHdpZHRoOiAwLCBoZWlnaHQ6IDAgfSwgb3ZlcmxheUhvc3QsICgpID0+IHtcblx0XHRcdGZhY3RvcnlDYWxsZWQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIG5ldyBUZXN0QW5pbWF0aW9uSGFuZGxlKCk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYW5pbWF0aW9uLCBmYWN0b3J5Q2FsbGVkIH0sIHsgYW5pbWF0aW9uOiB1bmRlZmluZWQsIGZhY3RvcnlDYWxsZWQ6IGZhbHNlIH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUNBQTBFO0FBRW5GLE1BQU0sNEJBQTRCLFlBQXNEO0FBQUEsRUFBeEY7QUFBQTtBQUNDLHFCQUFZO0FBQUE7QUFBQSxFQUVaLFNBQWU7QUFDZCxTQUFLLFlBQVk7QUFDakIsU0FBSyxjQUFjLElBQUksTUFBTSxRQUFRLENBQUM7QUFBQSxFQUN2QztBQUFBLEVBRUEsU0FBZTtBQUNkLFNBQUssY0FBYyxJQUFJLE1BQU0sUUFBUSxDQUFDO0FBQUEsRUFDdkM7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QixZQUFZO0FBQUEsTUFDWixXQUFXLENBQUMsTUFBTSxJQUFJO0FBQUEsSUFDdkIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseURBQXlELE1BQU07QUFDbkUsVUFBTSxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQzVDLFVBQU0sY0FBYyxTQUFTLGNBQWMsS0FBSztBQUNoRCxZQUFRLE1BQU0sa0JBQWtCO0FBQ2hDLGNBQVUsU0FBUyxJQUFJLElBQUksS0FBSyxFQUFFO0FBQ2xDLFVBQU0sZUFBZSxJQUFJLG9CQUFvQjtBQUM3QyxRQUFJLGlCQUFpQjtBQUVyQixXQUFPLE9BQU8sTUFBTSw4QkFBOEIsU0FBUyxFQUFFLE1BQU0sS0FBSyxLQUFLLElBQUksT0FBTyxJQUFJLFFBQVEsR0FBRyxHQUFHLGFBQWEsTUFBTTtBQUM1SCxVQUFJLHFCQUFxQixHQUFHO0FBQzNCLGVBQU87QUFBQSxNQUNSO0FBQ0EsWUFBTSxJQUFJLE1BQU0sdUJBQXVCO0FBQUEsSUFDeEMsQ0FBQyxHQUFHLHVCQUF1QjtBQUUzQixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLG1CQUFtQixRQUFRLFVBQVUsU0FBUywyQkFBMkI7QUFBQSxNQUN6RSxpQkFBaUIsUUFBUSxNQUFNO0FBQUEsTUFDL0IsWUFBWSxZQUFZLGlCQUFpQiw4QkFBOEIsRUFBRTtBQUFBLE1BQ3pFLHVCQUF1QixhQUFhO0FBQUEsSUFDckMsR0FBRztBQUFBLE1BQ0YsbUJBQW1CO0FBQUEsTUFDbkIsaUJBQWlCO0FBQUEsTUFDakIsWUFBWTtBQUFBLE1BQ1osdUJBQXVCO0FBQUEsSUFDeEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMkRBQTJELE1BQU07QUFDckUsVUFBTSxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQzVDLFVBQU0sY0FBYyxTQUFTLGNBQWMsS0FBSztBQUNoRCxjQUFVLFNBQVMsSUFBSSxJQUFJLEtBQUssRUFBRTtBQUNsQyxRQUFJLGdCQUFnQjtBQUVwQixVQUFNLFlBQVksOEJBQThCLFNBQVMsRUFBRSxNQUFNLEdBQUcsS0FBSyxHQUFHLE9BQU8sR0FBRyxRQUFRLEVBQUUsR0FBRyxhQUFhLE1BQU07QUFDckgsc0JBQWdCO0FBQ2hCLGFBQU8sSUFBSSxvQkFBb0I7QUFBQSxJQUNoQyxDQUFDO0FBRUQsV0FBTyxnQkFBZ0IsRUFBRSxXQUFXLGNBQWMsR0FBRyxFQUFFLFdBQVcsUUFBVyxlQUFlLE1BQU0sQ0FBQztBQUFBLEVBQ3BHLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
