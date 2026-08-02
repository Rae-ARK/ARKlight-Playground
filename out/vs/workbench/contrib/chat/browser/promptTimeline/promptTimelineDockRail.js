import { $, addDisposableListener, append, clearNode, EventType, getWindow } from "../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { Gesture, EventType as TouchEventType } from "../../../../../base/browser/touch.js";
import { Emitter } from "../../../../../base/common/event.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { MIN_HOST_WIDTH } from "./promptTimelineLayout.js";
import "./media/promptTimeline.css";
const MAX_REST_DOTS = 50;
let dockIdSeq = 0;
class PromptTimelineDockRail extends Disposable {
  constructor() {
    super();
    this._rowDisposables = this._register(new DisposableStore());
    this._rows = [];
    /** The resting dots, in order; `_dotTicks[i]` is the tick index dot `i` stands for. */
    this._dots = [];
    this._dotTicks = [];
    this._hostWidth = Number.POSITIVE_INFINITY;
    /** Disclosure held open by explicit activation (handle click/tap/keyboard, or a row focused via keyboard). */
    this._open = false;
    /** Pointer is over the rail; reveals the flyout transiently (independent of {@link _open}). */
    this._hovering = false;
    /** Tick index previewed by the dot currently under the pointer, or `-1` when no dot is hovered. */
    this._previewIndex = -1;
    this._onDidSelect = this._register(new Emitter());
    this.onDidSelect = this._onDidSelect.event;
    // The dock lists prompts and jumps to them; it never opens the review drill-down the ruler's hover
    // card offers, so these stay unused. They are kept to satisfy the shared rail contract.
    this._onDidReview = this._register(new Emitter());
    this.onDidReview = this._onDidReview.event;
    this._onDidReviewFile = this._register(new Emitter());
    this.onDidReviewFile = this._onDidReviewFile.event;
    this._domNode = $("nav.prompt-timeline-rail.prompt-timeline-rail-dock");
    this._domNode.setAttribute("aria-label", localize("promptTimeline.dock.railLabel", "Prompt timeline"));
    this._domNode.setAttribute("role", "toolbar");
    this._domNode.setAttribute("aria-orientation", "vertical");
    const panelId = `prompt-timeline-dock-panel-${dockIdSeq++}`;
    this._rest = append(this._domNode, $("button.prompt-timeline-dock-rest"));
    this._rest.setAttribute("aria-haspopup", "true");
    this._rest.setAttribute("aria-expanded", "false");
    this._rest.setAttribute("aria-controls", panelId);
    this._rest.setAttribute("aria-label", localize("promptTimeline.dock.toggleLabel", "Show prompts"));
    this._rest.tabIndex = 0;
    this._list = append(this._domNode, $(".prompt-timeline-dock-panel"));
    this._list.id = panelId;
    this._register(addDisposableListener(this._domNode, EventType.MOUSE_OVER, () => {
      this._hovering = true;
      this._updateRevealed();
    }));
    this._register(addDisposableListener(this._domNode, EventType.MOUSE_OUT, (e) => {
      if (!this._domNode.contains(e.relatedTarget)) {
        this._hovering = false;
        this._setPreview(-1);
        this._updateRevealed();
      }
    }));
    this._register(addDisposableListener(this._list, EventType.MOUSE_OVER, () => this._setPreview(-1)));
    this._register(Gesture.addTarget(this._rest));
    this._register(addDisposableListener(this._rest, EventType.CLICK, (e) => {
      e.preventDefault();
      this._toggleOpen();
    }));
    this._register(addDisposableListener(this._rest, TouchEventType.Tap, () => this._toggleOpen()));
    this._register(addDisposableListener(this._rest, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) {
        event.preventDefault();
        event.stopPropagation();
        this._toggleOpen();
      }
    }));
    this._register(addDisposableListener(this._list, EventType.KEY_DOWN, (e) => this._onListKeyDown(e)));
    this._register(addDisposableListener(this._domNode, EventType.FOCUS_OUT, (e) => {
      if (!this._domNode.contains(e.relatedTarget)) {
        this._open = false;
        this._updateRevealed();
      }
    }));
  }
  get domNode() {
    return this._domNode;
  }
  /** Reveal whenever the disclosure is open OR the pointer is hovering; keep `aria-expanded` in sync. */
  _updateRevealed() {
    const revealed = this._open || this._hovering;
    this._domNode.classList.toggle("revealed", revealed);
    this._rest.setAttribute("aria-expanded", String(revealed));
  }
  /** Toggle the disclosure via explicit activation: opening focuses a row, closing returns to the handle. */
  _toggleOpen() {
    if (this._open) {
      this._close();
    } else {
      this._open = true;
      this._updateRevealed();
      this._focusActiveRow();
    }
  }
  /** Collapse the disclosure and return focus to the handle (shared close path for activation and Escape). */
  _close() {
    this._open = false;
    this._updateRevealed();
    this._rest.focus();
  }
  _focusActiveRow() {
    const activeIndex = this._rows.findIndex((r) => r.button.tabIndex === 0);
    this._rows[activeIndex >= 0 ? activeIndex : 0]?.button.focus();
  }
  setFilesProvider(_provider) {
  }
  /**
   * Rebuilds the resting handle's dots. There is one dot per prompt up to {@link MAX_REST_DOTS};
   * beyond that the dots are evenly sampled across the session so every dot still stands for a real
   * prompt (and the active prompt always maps to one), with a trailing marker signalling the sampling.
   */
  _renderDots(count) {
    clearNode(this._rest);
    this._dots.length = 0;
    this._dotTicks.length = 0;
    const dots = Math.min(count, MAX_REST_DOTS);
    for (let i = 0; i < dots; i++) {
      const dot = append(this._rest, $(".prompt-timeline-dock-dot"));
      const tickIndex = dots === count ? i : Math.round(i * (count - 1) / (dots - 1));
      this._dots.push(dot);
      this._dotTicks.push(tickIndex);
      this._rowDisposables.add(addDisposableListener(dot, EventType.MOUSE_OVER, () => this._setPreview(tickIndex)));
    }
    if (count > MAX_REST_DOTS) {
      append(this._rest, $(".prompt-timeline-dock-dot-more"));
    }
  }
  /** Previews the prompt a hovered dot stands for by highlighting its row and scrolling it into view. */
  _setPreview(index) {
    if (this._previewIndex === index) {
      return;
    }
    this._previewIndex = index;
    for (let i = 0; i < this._rows.length; i++) {
      this._rows[i].button.classList.toggle("preview", i === index);
    }
    for (let i = 0; i < this._dots.length; i++) {
      this._dots[i].classList.toggle("preview", this._dotTicks[i] === index);
    }
    if (index >= 0) {
      this._revealRow(index);
    }
  }
  /**
   * Scrolls a row into view inside the flyout. Done by hand rather than with `scrollIntoView` so a
   * hover can never scroll the transcript (or any other ancestor) behind the rail.
   */
  _revealRow(index) {
    const button = this._rows[index]?.button;
    if (!button) {
      return;
    }
    const top = button.offsetTop;
    const bottom = top + button.offsetHeight;
    const viewTop = this._list.scrollTop;
    const viewBottom = viewTop + this._list.clientHeight;
    if (top < viewTop) {
      this._list.scrollTop = top;
    } else if (bottom > viewBottom) {
      this._list.scrollTop = bottom - this._list.clientHeight;
    }
  }
  setTicks(ticks) {
    const sameStructure = ticks.length === this._rows.length && ticks.every((t, i) => this._rows[i]?.tick.requestId === t.requestId);
    if (sameStructure) {
      for (let i = 0; i < ticks.length; i++) {
        this._renderRow(this._rows[i], ticks[i]);
      }
      this._updateActiveClasses();
      return;
    }
    this._rowDisposables.clear();
    this._rows.length = 0;
    this._previewIndex = -1;
    clearNode(this._list);
    this._renderDots(ticks.length);
    for (const tick of ticks) {
      const button = append(this._list, $("button.prompt-timeline-dock-row"));
      button.tabIndex = -1;
      const label = append(button, $("span.prompt-timeline-dock-row-label"));
      const stat = append(button, $("span.prompt-timeline-dock-row-stat"));
      const entry = { tick, button, label, stat };
      this._renderRow(entry, tick);
      const requestId = tick.requestId;
      this._rowDisposables.add(addDisposableListener(button, EventType.CLICK, () => {
        this._onDidSelect.fire(requestId);
        this._close();
      }));
      this._rowDisposables.add(addDisposableListener(button, EventType.FOCUS, () => {
        this._open = true;
        this._updateRevealed();
        this._updateTabStops(this._rows.indexOf(entry));
      }));
      this._rows.push(entry);
    }
    const activeIndex = this._rows.findIndex((r) => r.tick.requestId === this._activeRequestId);
    this._updateTabStops(activeIndex >= 0 ? activeIndex : 0);
    this._updateActiveClasses();
  }
  _renderRow(entry, tick) {
    entry.tick = tick;
    entry.button.setAttribute("aria-label", tick.ariaLabel);
    entry.label.textContent = tick.text;
    entry.label.title = tick.text;
    this._renderStat(entry.stat, tick.stat);
  }
  _renderStat(container, stat) {
    clearNode(container);
    if (!stat || stat.added + stat.removed === 0) {
      container.classList.add("hidden");
      return;
    }
    container.classList.remove("hidden");
    append(container, $("span.added")).textContent = `+${stat.added}`;
    append(container, $("span.removed")).textContent = `\u2212${stat.removed}`;
  }
  /** Roving tabindex: exactly one row is tabbable so the flyout is a single Tab stop. */
  _updateTabStops(focusIndex) {
    for (let i = 0; i < this._rows.length; i++) {
      this._rows[i].button.tabIndex = i === focusIndex ? 0 : -1;
    }
  }
  _onListKeyDown(e) {
    if (this._rows.length === 0) {
      return;
    }
    const event = new StandardKeyboardEvent(e);
    if (event.keyCode === KeyCode.Escape) {
      event.preventDefault();
      event.stopPropagation();
      this._close();
      return;
    }
    const currentIndex = this._rows.findIndex((r) => r.button === getWindow(this._domNode).document.activeElement);
    let nextIndex;
    switch (event.keyCode) {
      case KeyCode.DownArrow:
        nextIndex = Math.min(this._rows.length - 1, currentIndex + 1);
        break;
      case KeyCode.UpArrow:
        nextIndex = Math.max(0, currentIndex - 1);
        break;
      case KeyCode.Home:
        nextIndex = 0;
        break;
      case KeyCode.End:
        nextIndex = this._rows.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    this._updateTabStops(nextIndex);
    this._rows[nextIndex]?.button.focus();
  }
  setActive(requestId) {
    this._activeRequestId = requestId;
    this._updateActiveClasses();
  }
  _updateActiveClasses() {
    let activeIndex = -1;
    for (let i = 0; i < this._rows.length; i++) {
      const row = this._rows[i];
      const active = this._activeRequestId !== void 0 && (row.tick.requestId === this._activeRequestId || row.tick.allRequestIds.includes(this._activeRequestId));
      if (active) {
        activeIndex = i;
      }
      row.button.classList.toggle("active", active);
      if (active) {
        row.button.setAttribute("aria-current", "location");
      } else {
        row.button.removeAttribute("aria-current");
      }
    }
    this._updateActiveDot(activeIndex);
  }
  /**
   * Accents the dot standing for the prompt the transcript is scrolled to, so the resting handle
   * reads as a "you are here" and tracks scrolling. Once the dots are sampled
   * ({@link MAX_REST_DOTS}) the nearest dot stands in for the active prompt.
   */
  _updateActiveDot(activeIndex) {
    let activeDot = -1;
    if (activeIndex >= 0) {
      let bestDelta = Number.POSITIVE_INFINITY;
      for (let i = 0; i < this._dotTicks.length; i++) {
        const delta = Math.abs(this._dotTicks[i] - activeIndex);
        if (delta < bestDelta) {
          bestDelta = delta;
          activeDot = i;
        }
      }
    }
    for (let i = 0; i < this._dots.length; i++) {
      this._dots[i].classList.toggle("active", i === activeDot);
    }
  }
  focusTick(requestId) {
    this._rows.find((r) => r.tick.requestId === requestId || r.tick.allRequestIds.includes(requestId))?.button.focus();
  }
  setHostWidth(width) {
    if (width > 0 && width !== this._hostWidth) {
      this._hostWidth = width;
      this._domNode.classList.toggle("overflowing", width < MIN_HOST_WIDTH);
    }
  }
  // The ruler blooms its fan on a hard scroll and scatters marks by scroll position; the dock is a
  // static, evenly-spaced list, so both are intentionally no-ops.
  notifyHardWheel() {
  }
  setScrollLayout(_layout) {
  }
}
export {
  PromptTimelineDockRail
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9wcm9tcHRUaW1lbGluZS9wcm9tcHRUaW1lbGluZURvY2tSYWlsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhcHBlbmQsIGNsZWFyTm9kZSwgRXZlbnRUeXBlLCBnZXRXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEdlc3R1cmUsIEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTUlOX0hPU1RfV0lEVEggfSBmcm9tICcuL3Byb21wdFRpbWVsaW5lTGF5b3V0LmpzJztcbmltcG9ydCB7IFByb21wdERpZmZTdGF0LCBQcm9tcHRGaWxlRGlmZiwgUHJvbXB0VGljaywgSVByb21wdFNjcm9sbExheW91dCB9IGZyb20gJy4vcHJvbXB0VGltZWxpbmVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0UmV2aWV3RmlsZUV2ZW50LCBJUHJvbXB0VGltZWxpbmVSYWlsIH0gZnJvbSAnLi9wcm9tcHRUaW1lbGluZVJhaWwuanMnO1xuaW1wb3J0ICcuL21lZGlhL3Byb21wdFRpbWVsaW5lLmNzcyc7XG5cbi8qKlxuICogVXBwZXIgYm91bmQgb24gdGhlIG51bWJlciBvZiByZXN0aW5nIGRvdHMgZHJhd24gb24gdGhlIGhhbmRsZS4gVGhlIGZseW91dCBsaXN0IGlzIHVuY2FwcGVkIChpdFxuICogbGlzdHMgZXZlcnkgcHJvbXB0KSwgYnV0IHRoZSBkb3QgY29sdW1uIHdvdWxkIGdyb3cgdW5ib3VuZGVkbHkgdGFsbCBmb3IgdmVyeSBsb25nIHNlc3Npb25zLCBzbyBpdFxuICogaXMgY2FwcGVkOiBwYXN0IHRoZSBjYXAgdGhlIGRvdHMgYXJlIGV2ZW5seSBzYW1wbGVkIGFjcm9zcyB0aGUgc2Vzc2lvbiAoZXZlcnkgZG90IHN0aWxsIHN0YW5kcyBmb3JcbiAqIGEgcmVhbCBwcm9tcHQsIHNvIHRoZSBcInlvdSBhcmUgaGVyZVwiIGRvdCBhbHdheXMgZXhpc3RzKSBhbmQgYSB0cmFpbGluZyBtYXJrZXIgc2lnbmFscyB0aGUgc2FtcGxpbmcuXG4gKi9cbmNvbnN0IE1BWF9SRVNUX0RPVFMgPSA1MDtcblxuaW50ZXJmYWNlIElSb3dFbnRyeSB7XG5cdHRpY2s6IFByb21wdFRpY2s7XG5cdHJlYWRvbmx5IGJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxhYmVsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgc3RhdDogSFRNTEVsZW1lbnQ7XG59XG5cbi8qKiBVbmlxdWUtcGVyLWluc3RhbmNlIHN1ZmZpeCBzbyB0aGUgZmx5b3V0J3MgaWQgKHJlZmVyZW5jZWQgYnkgdGhlIGhhbmRsZSdzIGBhcmlhLWNvbnRyb2xzYCkgbmV2ZXIgY29sbGlkZXMuICovXG5sZXQgZG9ja0lkU2VxID0gMDtcblxuLyoqXG4gKiBBIG1pbmltYWwsIGxlZnQtZWRnZSBwcm9tcHQgdGltZWxpbmUuIEF0IHJlc3QgaXQgaXMgb25seSBhIHNtYWxsIGhhbmRsZSBpbiB0aGUgdHJhbnNjcmlwdCdzIGxlZnRcbiAqIGd1dHRlciAob25lIGRvdCBwZXIgcHJvbXB0LCB0aGUgY3VycmVudCBwcm9tcHQncyBkb3QgYWNjZW50ZWQpIFx1MjAxNCBubyBwZXItcHJvbXB0IG1hcmtzLCBubyBkaWZmXG4gKiBjb2xvdXIgXHUyMDE0IHNvIHRoZSB0cmFuc2NyaXB0IHN0YXlzIGNhbG0uIEhvdmVyaW5nLCB0YXBwaW5nLCBvciBmb2N1c2luZyB0aGUgaGFuZGxlIGV4cGFuZHMgYSBmbHlvdXRcbiAqIGxpc3RpbmcgZXZlcnkgcHJvbXB0IChpdHMgdGV4dCBhbmQgYSBkaWZmIGJhZGdlKSB0byB0aGUgKnJpZ2h0KiBvZiB0aGUgZG90cywgc28gdGhlIGRvdHMgc3RheVxuICogdmlzaWJsZSBhbmQga2VlcCB3b3JraW5nIGFzIGEgc2NydWJiZXI6IGhvdmVyaW5nIGFuIGluZGl2aWR1YWwgZG90IHByZXZpZXdzIGl0cyBwcm9tcHQgaW4gdGhlXG4gKiBmbHlvdXQuIEFjdGl2YXRpbmcgYSByb3cgcmV2ZWFscyB0aGF0IHByb21wdCBhbmQgY2xvc2VzIHRoZSBmbHlvdXQuIEJlY2F1c2UgdGhlIGxpc3QgaXMgZXZlbmx5XG4gKiBzcGFjZWQgYW5kIG5ldmVyIGRlcml2ZWQgZnJvbSByZXNwb25zZSBoZWlnaHRzLCBpdCBzdGF5cyBzdGFibGUgdW5kZXIgdmlydHVhbGl6YXRpb24uXG4gKlxuICogVGhlIGhhbmRsZSBpcyBhbiBhY2Nlc3NpYmxlIGRpc2Nsb3N1cmUgYnV0dG9uIChgYXJpYS1leHBhbmRlZGAvYGFyaWEtY29udHJvbHNgKSB3aXJlZCBmb3IgbW91c2UsXG4gKiB0b3VjaCAodmlhIHtAbGluayBHZXN0dXJlfSkgYW5kIGtleWJvYXJkOyB0aGUgZmx5b3V0IGlzIGEgc2luZ2xlLXRhYi1zdG9wIHRvb2xiYXIgd2hvc2Ugcm93cyBhcmVcbiAqIHJlYWNoZWQgd2l0aCBBcnJvdy9Ib21lL0VuZCBhbmQgZGlzbWlzc2VkIHdpdGggRXNjYXBlLlxuICpcbiAqIEl0IGltcGxlbWVudHMgdGhlIHNhbWUge0BsaW5rIElQcm9tcHRUaW1lbGluZVJhaWx9IGNvbnRyYWN0IGFzIHRoZSBvdmVydmlldy1ydWxlciByYWlsIHNvIHRoZSB0d29cbiAqIGFyZSBpbnRlcmNoYW5nZWFibGUgYmVoaW5kIHRoZSBgc2Vzc2lvbnMucHJvbXB0VGltZWxpbmUucmFpbGAgc2V0dGluZzsgdGhlIHNjcm9sbC1kcml2ZW4gYW5kXG4gKiBmaXNoZXllIGFmZm9yZGFuY2VzIHRoZSBydWxlciBuZWVkcyAoaGFyZC13aGVlbCBibG9vbSwgcHJvcG9ydGlvbmFsIHNjcm9sbCBsYXlvdXQpIGFyZSBuby1vcHMgaGVyZS5cbiAqL1xuZXhwb3J0IGNsYXNzIFByb21wdFRpbWVsaW5lRG9ja1JhaWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVByb21wdFRpbWVsaW5lUmFpbCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc3Q6IEhUTUxCdXR0b25FbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saXN0OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfcm93RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yb3dzOiBJUm93RW50cnlbXSA9IFtdO1xuXHQvKiogVGhlIHJlc3RpbmcgZG90cywgaW4gb3JkZXI7IGBfZG90VGlja3NbaV1gIGlzIHRoZSB0aWNrIGluZGV4IGRvdCBgaWAgc3RhbmRzIGZvci4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZG90czogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb3RUaWNrczogbnVtYmVyW10gPSBbXTtcblx0cHJpdmF0ZSBfYWN0aXZlUmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2hvc3RXaWR0aCA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblx0LyoqIERpc2Nsb3N1cmUgaGVsZCBvcGVuIGJ5IGV4cGxpY2l0IGFjdGl2YXRpb24gKGhhbmRsZSBjbGljay90YXAva2V5Ym9hcmQsIG9yIGEgcm93IGZvY3VzZWQgdmlhIGtleWJvYXJkKS4gKi9cblx0cHJpdmF0ZSBfb3BlbiA9IGZhbHNlO1xuXHQvKiogUG9pbnRlciBpcyBvdmVyIHRoZSByYWlsOyByZXZlYWxzIHRoZSBmbHlvdXQgdHJhbnNpZW50bHkgKGluZGVwZW5kZW50IG9mIHtAbGluayBfb3Blbn0pLiAqL1xuXHRwcml2YXRlIF9ob3ZlcmluZyA9IGZhbHNlO1xuXHQvKiogVGljayBpbmRleCBwcmV2aWV3ZWQgYnkgdGhlIGRvdCBjdXJyZW50bHkgdW5kZXIgdGhlIHBvaW50ZXIsIG9yIGAtMWAgd2hlbiBubyBkb3QgaXMgaG92ZXJlZC4gKi9cblx0cHJpdmF0ZSBfcHJldmlld0luZGV4ID0gLTE7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZWxlY3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNlbGVjdDogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkU2VsZWN0LmV2ZW50O1xuXG5cdC8vIFRoZSBkb2NrIGxpc3RzIHByb21wdHMgYW5kIGp1bXBzIHRvIHRoZW07IGl0IG5ldmVyIG9wZW5zIHRoZSByZXZpZXcgZHJpbGwtZG93biB0aGUgcnVsZXIncyBob3ZlclxuXHQvLyBjYXJkIG9mZmVycywgc28gdGhlc2Ugc3RheSB1bnVzZWQuIFRoZXkgYXJlIGtlcHQgdG8gc2F0aXNmeSB0aGUgc2hhcmVkIHJhaWwgY29udHJhY3QuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmV2aWV3ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UHJvbXB0VGljaz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmV2aWV3OiBFdmVudDxQcm9tcHRUaWNrPiA9IHRoaXMuX29uRGlkUmV2aWV3LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJldmlld0ZpbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUHJvbXB0UmV2aWV3RmlsZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXZpZXdGaWxlOiBFdmVudDxJUHJvbXB0UmV2aWV3RmlsZUV2ZW50PiA9IHRoaXMuX29uRGlkUmV2aWV3RmlsZS5ldmVudDtcblxuXHRnZXQgZG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7IHJldHVybiB0aGlzLl9kb21Ob2RlOyB9XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9kb21Ob2RlID0gJCgnbmF2LnByb21wdC10aW1lbGluZS1yYWlsLnByb21wdC10aW1lbGluZS1yYWlsLWRvY2snKTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdwcm9tcHRUaW1lbGluZS5kb2NrLnJhaWxMYWJlbCcsIFwiUHJvbXB0IHRpbWVsaW5lXCIpKTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldEF0dHJpYnV0ZSgncm9sZScsICd0b29sYmFyJyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtb3JpZW50YXRpb24nLCAndmVydGljYWwnKTtcblxuXHRcdGNvbnN0IHBhbmVsSWQgPSBgcHJvbXB0LXRpbWVsaW5lLWRvY2stcGFuZWwtJHtkb2NrSWRTZXErK31gO1xuXG5cdFx0Ly8gVGhlIHJlc3RpbmcgYWZmb3JkYW5jZSBpcyBhIGRpc2Nsb3N1cmUgYnV0dG9uIHRoYXQgZXhwYW5kcyB0aGUgZmx5b3V0LiBJdCBjYXJyaWVzIG9uZSBkb3QgcGVyXG5cdFx0Ly8gcHJvbXB0IChidWlsdCBpbiBgc2V0VGlja3NgKTsgdGhlIGRvdHMgYXJlIGRlY29yYXRpdmUgXHUyMDE0IHBvaW50ZXIgdGFyZ2V0cyBvbmx5LCBuZXZlciBmb2N1c2FibGUgXHUyMDE0XG5cdFx0Ly8gc28gdGhlIGJ1dHRvbiBvd25zIHRoZSBhY2Nlc3NpYmxlIG5hbWUgYW5kIHRoZSBmbHlvdXQgcm93cyBjYXJyeSB0aGUgcGVyLXByb21wdCBzZW1hbnRpY3MuXG5cdFx0dGhpcy5fcmVzdCA9IGFwcGVuZCh0aGlzLl9kb21Ob2RlLCAkPEhUTUxCdXR0b25FbGVtZW50PignYnV0dG9uLnByb21wdC10aW1lbGluZS1kb2NrLXJlc3QnKSk7XG5cdFx0dGhpcy5fcmVzdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGFzcG9wdXAnLCAndHJ1ZScpO1xuXHRcdHRoaXMuX3Jlc3Quc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ2ZhbHNlJyk7XG5cdFx0dGhpcy5fcmVzdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtY29udHJvbHMnLCBwYW5lbElkKTtcblx0XHR0aGlzLl9yZXN0LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdwcm9tcHRUaW1lbGluZS5kb2NrLnRvZ2dsZUxhYmVsJywgXCJTaG93IHByb21wdHNcIikpO1xuXHRcdHRoaXMuX3Jlc3QudGFiSW5kZXggPSAwO1xuXG5cdFx0dGhpcy5fbGlzdCA9IGFwcGVuZCh0aGlzLl9kb21Ob2RlLCAkKCcucHJvbXB0LXRpbWVsaW5lLWRvY2stcGFuZWwnKSk7XG5cdFx0dGhpcy5fbGlzdC5pZCA9IHBhbmVsSWQ7XG5cblx0XHQvLyBNb3VzZTogcmV2ZWFsIHdoaWxlIHRoZSBwb2ludGVyIGlzIG92ZXIgdGhlIHJhaWwgc3VidHJlZS4gVGhlIHJhaWwgZWxlbWVudCBpc1xuXHRcdC8vIHBvaW50ZXItdHJhbnNwYXJlbnQgKGl0cyBjaGlsZHJlbiBvcHQgYmFjayBpbiksIHNvIGBtb3VzZWVudGVyYCBuZXZlciBmaXJlcyBvbiBpdCBcdTIwMTQgYnViYmxlXG5cdFx0Ly8gYG1vdXNlb3ZlcmAvYG1vdXNlb3V0YCBmcm9tIHRoZSBoYW5kbGUgYW5kIGZseW91dCBpbnN0ZWFkLCBhbmQgb25seSBjb2xsYXBzZSBvbmNlIHRoZSBwb2ludGVyXG5cdFx0Ly8gdHJ1bHkgbGVhdmVzIHRoZSByYWlsIHN1YnRyZWUuIFRoZSBoYW5kbGUgYW5kIHRoZSBmbHlvdXQgYXJlIGxhaWQgb3V0IGZsdXNoICh0aGUgZmx5b3V0IHN0YXJ0c1xuXHRcdC8vIGV4YWN0bHkgYXQgdGhlIGhhbmRsZSdzIHJpZ2h0IGVkZ2UgXHUyMDE0IHNlZSB0aGUgc2hhcmVkIGAtLXByb21wdC10aW1lbGluZS1kb2NrLWhhbmRsZS0qYCB2YXJzKSwgc29cblx0XHQvLyB0aGV5IGZvcm0gb25lIGNvbnRpZ3VvdXMgaG92ZXIgcmVnaW9uOiB0cmF2ZWxsaW5nIGJldHdlZW4gdGhlbSBrZWVwcyBgcmVsYXRlZFRhcmdldGAgaW5zaWRlIHRoZVxuXHRcdC8vIHJhaWwgYW5kIG5ldmVyIGNvbGxhcHNlcywgd2hpY2ggbWVhbnMgYSBsZWF2ZSBoZXJlIGlzIGFsd2F5cyBhIHJlYWwgbGVhdmUuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RvbU5vZGUsIEV2ZW50VHlwZS5NT1VTRV9PVkVSLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9ob3ZlcmluZyA9IHRydWU7XG5cdFx0XHR0aGlzLl91cGRhdGVSZXZlYWxlZCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZG9tTm9kZSwgRXZlbnRUeXBlLk1PVVNFX09VVCwgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGlmICghdGhpcy5fZG9tTm9kZS5jb250YWlucyhlLnJlbGF0ZWRUYXJnZXQgYXMgTm9kZSB8IG51bGwpKSB7XG5cdFx0XHRcdHRoaXMuX2hvdmVyaW5nID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX3NldFByZXZpZXcoLTEpO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVSZXZlYWxlZCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIE9uY2UgdGhlIHBvaW50ZXIgaXMgYnJvd3NpbmcgdGhlIGZseW91dCBpdHNlbGYsIHRoZSByb3cgdW5kZXIgaXQgaXMgdGhlIHN1YmplY3Q7IGRyb3AgdGhlXG5cdFx0Ly8gZG90LWRyaXZlbiBwcmV2aWV3IHNvIG9ubHkgb25lIHJvdyByZWFkcyBhcyBoaWdobGlnaHRlZC5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fbGlzdCwgRXZlbnRUeXBlLk1PVVNFX09WRVIsICgpID0+IHRoaXMuX3NldFByZXZpZXcoLTEpKSk7XG5cblx0XHQvLyBUb3VjaCArIGNsaWNrICsga2V5Ym9hcmQgdG9nZ2xlIG9uIHRoZSBoYW5kbGUgKGlPUyBuZWVkcyBib3RoIGNsaWNrIGFuZCB0YXAgcGVyIFNlc3Npb25zIGd1aWRhbmNlKS5cblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldCh0aGlzLl9yZXN0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3Jlc3QsIEV2ZW50VHlwZS5DTElDSywgZSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgdGhpcy5fdG9nZ2xlT3BlbigpOyB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3Jlc3QsIFRvdWNoRXZlbnRUeXBlLlRhcCwgKCkgPT4gdGhpcy5fdG9nZ2xlT3BlbigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3Jlc3QsIEV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciB8fCBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlNwYWNlKSB7XG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl90b2dnbGVPcGVuKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gS2V5Ym9hcmQ6IG9uZSBUYWIgc3RvcCBpbnRvIHRoZSBmbHlvdXQ7IEFycm93L0hvbWUvRW5kIG1vdmUgYmV0d2VlbiByb3dzLCBFc2NhcGUgZGlzbWlzc2VzLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9saXN0LCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4gdGhpcy5fb25MaXN0S2V5RG93bihlKSkpO1xuXG5cdFx0Ly8gRm9jdXMgZnVsbHkgbGVhdmluZyB0aGUgcmFpbCBjb2xsYXBzZXMgdGhlIGRpc2Nsb3N1cmUgKGNvdmVycyBTaGlmdCtUYWIgb2ZmIHRoZSBoYW5kbGUsXG5cdFx0Ly8gVGFiIHBhc3QgdGhlIGxhc3Qgcm93LCBhbmQgdGFwcGluZyBlbHNld2hlcmUgb24gdG91Y2gsIHdoZXJlIG5vIG1vdXNlb3V0IGZpcmVzKS5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZG9tTm9kZSwgRXZlbnRUeXBlLkZPQ1VTX09VVCwgKGU6IEZvY3VzRXZlbnQpID0+IHtcblx0XHRcdGlmICghdGhpcy5fZG9tTm9kZS5jb250YWlucyhlLnJlbGF0ZWRUYXJnZXQgYXMgTm9kZSB8IG51bGwpKSB7XG5cdFx0XHRcdHRoaXMuX29wZW4gPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlUmV2ZWFsZWQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKiogUmV2ZWFsIHdoZW5ldmVyIHRoZSBkaXNjbG9zdXJlIGlzIG9wZW4gT1IgdGhlIHBvaW50ZXIgaXMgaG92ZXJpbmc7IGtlZXAgYGFyaWEtZXhwYW5kZWRgIGluIHN5bmMuICovXG5cdHByaXZhdGUgX3VwZGF0ZVJldmVhbGVkKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJldmVhbGVkID0gdGhpcy5fb3BlbiB8fCB0aGlzLl9ob3ZlcmluZztcblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ3JldmVhbGVkJywgcmV2ZWFsZWQpO1xuXHRcdHRoaXMuX3Jlc3Quc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKHJldmVhbGVkKSk7XG5cdH1cblxuXHQvKiogVG9nZ2xlIHRoZSBkaXNjbG9zdXJlIHZpYSBleHBsaWNpdCBhY3RpdmF0aW9uOiBvcGVuaW5nIGZvY3VzZXMgYSByb3csIGNsb3NpbmcgcmV0dXJucyB0byB0aGUgaGFuZGxlLiAqL1xuXHRwcml2YXRlIF90b2dnbGVPcGVuKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9vcGVuKSB7XG5cdFx0XHR0aGlzLl9jbG9zZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vcGVuID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3VwZGF0ZVJldmVhbGVkKCk7XG5cdFx0XHR0aGlzLl9mb2N1c0FjdGl2ZVJvdygpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBDb2xsYXBzZSB0aGUgZGlzY2xvc3VyZSBhbmQgcmV0dXJuIGZvY3VzIHRvIHRoZSBoYW5kbGUgKHNoYXJlZCBjbG9zZSBwYXRoIGZvciBhY3RpdmF0aW9uIGFuZCBFc2NhcGUpLiAqL1xuXHRwcml2YXRlIF9jbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vcGVuID0gZmFsc2U7XG5cdFx0dGhpcy5fdXBkYXRlUmV2ZWFsZWQoKTtcblx0XHR0aGlzLl9yZXN0LmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9mb2N1c0FjdGl2ZVJvdygpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVJbmRleCA9IHRoaXMuX3Jvd3MuZmluZEluZGV4KHIgPT4gci5idXR0b24udGFiSW5kZXggPT09IDApO1xuXHRcdHRoaXMuX3Jvd3NbYWN0aXZlSW5kZXggPj0gMCA/IGFjdGl2ZUluZGV4IDogMF0/LmJ1dHRvbi5mb2N1cygpO1xuXHR9XG5cblx0c2V0RmlsZXNQcm92aWRlcihfcHJvdmlkZXI6ICh0aWNrOiBQcm9tcHRUaWNrKSA9PiByZWFkb25seSBQcm9tcHRGaWxlRGlmZltdKTogdm9pZCB7XG5cdFx0Ly8gVGhlIGRvY2sgZG9lcyBub3Qgc3VyZmFjZSBwZXItZmlsZSBjaGFuZ2VzOyB0aGUgcnVsZXIgcmFpbCdzIGhvdmVyIGNhcmQgZG9lcy5cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWJ1aWxkcyB0aGUgcmVzdGluZyBoYW5kbGUncyBkb3RzLiBUaGVyZSBpcyBvbmUgZG90IHBlciBwcm9tcHQgdXAgdG8ge0BsaW5rIE1BWF9SRVNUX0RPVFN9O1xuXHQgKiBiZXlvbmQgdGhhdCB0aGUgZG90cyBhcmUgZXZlbmx5IHNhbXBsZWQgYWNyb3NzIHRoZSBzZXNzaW9uIHNvIGV2ZXJ5IGRvdCBzdGlsbCBzdGFuZHMgZm9yIGEgcmVhbFxuXHQgKiBwcm9tcHQgKGFuZCB0aGUgYWN0aXZlIHByb21wdCBhbHdheXMgbWFwcyB0byBvbmUpLCB3aXRoIGEgdHJhaWxpbmcgbWFya2VyIHNpZ25hbGxpbmcgdGhlIHNhbXBsaW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyRG90cyhjb3VudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y2xlYXJOb2RlKHRoaXMuX3Jlc3QpO1xuXHRcdHRoaXMuX2RvdHMubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9kb3RUaWNrcy5sZW5ndGggPSAwO1xuXHRcdGNvbnN0IGRvdHMgPSBNYXRoLm1pbihjb3VudCwgTUFYX1JFU1RfRE9UUyk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBkb3RzOyBpKyspIHtcblx0XHRcdGNvbnN0IGRvdCA9IGFwcGVuZCh0aGlzLl9yZXN0LCAkKCcucHJvbXB0LXRpbWVsaW5lLWRvY2stZG90JykpO1xuXHRcdFx0Y29uc3QgdGlja0luZGV4ID0gZG90cyA9PT0gY291bnQgPyBpIDogTWF0aC5yb3VuZChpICogKGNvdW50IC0gMSkgLyAoZG90cyAtIDEpKTtcblx0XHRcdHRoaXMuX2RvdHMucHVzaChkb3QpO1xuXHRcdFx0dGhpcy5fZG90VGlja3MucHVzaCh0aWNrSW5kZXgpO1xuXHRcdFx0Ly8gSG92ZXJpbmcgYSBkb3QgcHJldmlld3MgdGhlIHByb21wdCBpdCBzdGFuZHMgZm9yOiB0aGUgZmx5b3V0IGlzIGFscmVhZHkgcmV2ZWFsZWQgYnkgdGhlXG5cdFx0XHQvLyBidWJibGluZyBgbW91c2VvdmVyYCwgc28gdGhpcyBqdXN0IGJyaW5ncyB0aGF0IHJvdyBpbnRvIHZpZXcgYW5kIGhpZ2hsaWdodHMgaXQuXG5cdFx0XHR0aGlzLl9yb3dEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRvdCwgRXZlbnRUeXBlLk1PVVNFX09WRVIsICgpID0+IHRoaXMuX3NldFByZXZpZXcodGlja0luZGV4KSkpO1xuXHRcdH1cblx0XHQvLyBUaGUgZG90cyBhcmUgc2FtcGxlZCByYXRoZXIgdGhhbiBvbmUtcGVyLXByb21wdDogYSBzbWFsbCB0cmFpbGluZyBtYXJrZXIgc2lnbmFscyB0aGUgZWxpc2lvbi5cblx0XHRpZiAoY291bnQgPiBNQVhfUkVTVF9ET1RTKSB7XG5cdFx0XHRhcHBlbmQodGhpcy5fcmVzdCwgJCgnLnByb21wdC10aW1lbGluZS1kb2NrLWRvdC1tb3JlJykpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBQcmV2aWV3cyB0aGUgcHJvbXB0IGEgaG92ZXJlZCBkb3Qgc3RhbmRzIGZvciBieSBoaWdobGlnaHRpbmcgaXRzIHJvdyBhbmQgc2Nyb2xsaW5nIGl0IGludG8gdmlldy4gKi9cblx0cHJpdmF0ZSBfc2V0UHJldmlldyhpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3ByZXZpZXdJbmRleCA9PT0gaW5kZXgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcHJldmlld0luZGV4ID0gaW5kZXg7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9yb3dzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLl9yb3dzW2ldLmJ1dHRvbi5jbGFzc0xpc3QudG9nZ2xlKCdwcmV2aWV3JywgaSA9PT0gaW5kZXgpO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2RvdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuX2RvdHNbaV0uY2xhc3NMaXN0LnRvZ2dsZSgncHJldmlldycsIHRoaXMuX2RvdFRpY2tzW2ldID09PSBpbmRleCk7XG5cdFx0fVxuXHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHR0aGlzLl9yZXZlYWxSb3coaW5kZXgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTY3JvbGxzIGEgcm93IGludG8gdmlldyBpbnNpZGUgdGhlIGZseW91dC4gRG9uZSBieSBoYW5kIHJhdGhlciB0aGFuIHdpdGggYHNjcm9sbEludG9WaWV3YCBzbyBhXG5cdCAqIGhvdmVyIGNhbiBuZXZlciBzY3JvbGwgdGhlIHRyYW5zY3JpcHQgKG9yIGFueSBvdGhlciBhbmNlc3RvcikgYmVoaW5kIHRoZSByYWlsLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmV2ZWFsUm93KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBidXR0b24gPSB0aGlzLl9yb3dzW2luZGV4XT8uYnV0dG9uO1xuXHRcdGlmICghYnV0dG9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRvcCA9IGJ1dHRvbi5vZmZzZXRUb3A7XG5cdFx0Y29uc3QgYm90dG9tID0gdG9wICsgYnV0dG9uLm9mZnNldEhlaWdodDtcblx0XHRjb25zdCB2aWV3VG9wID0gdGhpcy5fbGlzdC5zY3JvbGxUb3A7XG5cdFx0Y29uc3Qgdmlld0JvdHRvbSA9IHZpZXdUb3AgKyB0aGlzLl9saXN0LmNsaWVudEhlaWdodDtcblx0XHRpZiAodG9wIDwgdmlld1RvcCkge1xuXHRcdFx0dGhpcy5fbGlzdC5zY3JvbGxUb3AgPSB0b3A7XG5cdFx0fSBlbHNlIGlmIChib3R0b20gPiB2aWV3Qm90dG9tKSB7XG5cdFx0XHR0aGlzLl9saXN0LnNjcm9sbFRvcCA9IGJvdHRvbSAtIHRoaXMuX2xpc3QuY2xpZW50SGVpZ2h0O1xuXHRcdH1cblx0fVxuXG5cdHNldFRpY2tzKHRpY2tzOiByZWFkb25seSBQcm9tcHRUaWNrW10pOiB2b2lkIHtcblx0XHRjb25zdCBzYW1lU3RydWN0dXJlID0gdGlja3MubGVuZ3RoID09PSB0aGlzLl9yb3dzLmxlbmd0aFxuXHRcdFx0JiYgdGlja3MuZXZlcnkoKHQsIGkpID0+IHRoaXMuX3Jvd3NbaV0/LnRpY2sucmVxdWVzdElkID09PSB0LnJlcXVlc3RJZCk7XG5cdFx0aWYgKHNhbWVTdHJ1Y3R1cmUpIHtcblx0XHRcdC8vIE9ubHkgdGhlIHN0YXRzIGNoYW5nZWQgKHN0cmVhbWluZyBlZGl0cyk7IHVwZGF0ZSB0aGVtIGluIHBsYWNlIHNvIGZvY3VzL2hvdmVyIGFyZSBrZXB0LlxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aWNrcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJSb3codGhpcy5fcm93c1tpXSwgdGlja3NbaV0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdXBkYXRlQWN0aXZlQ2xhc3NlcygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Jvd0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcm93cy5sZW5ndGggPSAwO1xuXHRcdHRoaXMuX3ByZXZpZXdJbmRleCA9IC0xO1xuXHRcdGNsZWFyTm9kZSh0aGlzLl9saXN0KTtcblx0XHQvLyBUaGUgcmVzdGluZyBkb3RzIHByZXZpZXcgaG93IG1hbnkgcHJvbXB0cyB0aGUgZmx5b3V0IGhvbGRzIGFuZCB3aGVyZSB0aGUgdHJhbnNjcmlwdCBpcy5cblx0XHR0aGlzLl9yZW5kZXJEb3RzKHRpY2tzLmxlbmd0aCk7XG5cblx0XHRmb3IgKGNvbnN0IHRpY2sgb2YgdGlja3MpIHtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGFwcGVuZCh0aGlzLl9saXN0LCAkPEhUTUxCdXR0b25FbGVtZW50PignYnV0dG9uLnByb21wdC10aW1lbGluZS1kb2NrLXJvdycpKTtcblx0XHRcdGJ1dHRvbi50YWJJbmRleCA9IC0xO1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBhcHBlbmQoYnV0dG9uLCAkKCdzcGFuLnByb21wdC10aW1lbGluZS1kb2NrLXJvdy1sYWJlbCcpKTtcblx0XHRcdGNvbnN0IHN0YXQgPSBhcHBlbmQoYnV0dG9uLCAkKCdzcGFuLnByb21wdC10aW1lbGluZS1kb2NrLXJvdy1zdGF0JykpO1xuXHRcdFx0Y29uc3QgZW50cnk6IElSb3dFbnRyeSA9IHsgdGljaywgYnV0dG9uLCBsYWJlbCwgc3RhdCB9O1xuXHRcdFx0dGhpcy5fcmVuZGVyUm93KGVudHJ5LCB0aWNrKTtcblx0XHRcdGNvbnN0IHJlcXVlc3RJZCA9IHRpY2sucmVxdWVzdElkO1xuXHRcdFx0Ly8gQWN0aXZhdGluZyBhIHJvdyBqdW1wcyB0byB0aGUgcHJvbXB0IGFuZCBjbG9zZXMgdGhlIGZseW91dCAoZm9jdXMgcmV0dXJucyB0byB0aGUgaGFuZGxlKSxcblx0XHRcdC8vIHNvIGl0IGRvZXMgbm90IGxpbmdlciBvdmVyIHRoZSB0cmFuc2NyaXB0LlxuXHRcdFx0dGhpcy5fcm93RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sIEV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFNlbGVjdC5maXJlKHJlcXVlc3RJZCk7XG5cdFx0XHRcdHRoaXMuX2Nsb3NlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yb3dEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJ1dHRvbiwgRXZlbnRUeXBlLkZPQ1VTLCAoKSA9PiB7XG5cdFx0XHRcdC8vIEtleWJvYXJkLWZvY3VzaW5nIGEgcm93IChlLmcuIFRhYiBpbiBmcm9tIHRoZSBoYW5kbGUpIGNvdW50cyBhcyBvcGVuaW5nIHRoZSBkaXNjbG9zdXJlLlxuXHRcdFx0XHR0aGlzLl9vcGVuID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlUmV2ZWFsZWQoKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVGFiU3RvcHModGhpcy5fcm93cy5pbmRleE9mKGVudHJ5KSk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yb3dzLnB1c2goZW50cnkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZUluZGV4ID0gdGhpcy5fcm93cy5maW5kSW5kZXgociA9PiByLnRpY2sucmVxdWVzdElkID09PSB0aGlzLl9hY3RpdmVSZXF1ZXN0SWQpO1xuXHRcdHRoaXMuX3VwZGF0ZVRhYlN0b3BzKGFjdGl2ZUluZGV4ID49IDAgPyBhY3RpdmVJbmRleCA6IDApO1xuXHRcdHRoaXMuX3VwZGF0ZUFjdGl2ZUNsYXNzZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclJvdyhlbnRyeTogSVJvd0VudHJ5LCB0aWNrOiBQcm9tcHRUaWNrKTogdm9pZCB7XG5cdFx0ZW50cnkudGljayA9IHRpY2s7XG5cdFx0ZW50cnkuYnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRpY2suYXJpYUxhYmVsKTtcblx0XHRlbnRyeS5sYWJlbC50ZXh0Q29udGVudCA9IHRpY2sudGV4dDtcblx0XHRlbnRyeS5sYWJlbC50aXRsZSA9IHRpY2sudGV4dDtcblx0XHR0aGlzLl9yZW5kZXJTdGF0KGVudHJ5LnN0YXQsIHRpY2suc3RhdCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJTdGF0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHN0YXQ6IFByb21wdERpZmZTdGF0IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y2xlYXJOb2RlKGNvbnRhaW5lcik7XG5cdFx0aWYgKCFzdGF0IHx8IHN0YXQuYWRkZWQgKyBzdGF0LnJlbW92ZWQgPT09IDApIHtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xuXHRcdGFwcGVuZChjb250YWluZXIsICQoJ3NwYW4uYWRkZWQnKSkudGV4dENvbnRlbnQgPSBgKyR7c3RhdC5hZGRlZH1gO1xuXHRcdGFwcGVuZChjb250YWluZXIsICQoJ3NwYW4ucmVtb3ZlZCcpKS50ZXh0Q29udGVudCA9IGBcXHUyMjEyJHtzdGF0LnJlbW92ZWR9YDtcblx0fVxuXG5cdC8qKiBSb3ZpbmcgdGFiaW5kZXg6IGV4YWN0bHkgb25lIHJvdyBpcyB0YWJiYWJsZSBzbyB0aGUgZmx5b3V0IGlzIGEgc2luZ2xlIFRhYiBzdG9wLiAqL1xuXHRwcml2YXRlIF91cGRhdGVUYWJTdG9wcyhmb2N1c0luZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3Jvd3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuX3Jvd3NbaV0uYnV0dG9uLnRhYkluZGV4ID0gaSA9PT0gZm9jdXNJbmRleCA/IDAgOiAtMTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vbkxpc3RLZXlEb3duKGU6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcm93cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkVzY2FwZSkge1xuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5fY2xvc2UoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudEluZGV4ID0gdGhpcy5fcm93cy5maW5kSW5kZXgociA9PiByLmJ1dHRvbiA9PT0gZ2V0V2luZG93KHRoaXMuX2RvbU5vZGUpLmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpO1xuXHRcdGxldCBuZXh0SW5kZXg6IG51bWJlcjtcblx0XHRzd2l0Y2ggKGV2ZW50LmtleUNvZGUpIHtcblx0XHRcdGNhc2UgS2V5Q29kZS5Eb3duQXJyb3c6IG5leHRJbmRleCA9IE1hdGgubWluKHRoaXMuX3Jvd3MubGVuZ3RoIC0gMSwgY3VycmVudEluZGV4ICsgMSk7IGJyZWFrO1xuXHRcdFx0Y2FzZSBLZXlDb2RlLlVwQXJyb3c6IG5leHRJbmRleCA9IE1hdGgubWF4KDAsIGN1cnJlbnRJbmRleCAtIDEpOyBicmVhaztcblx0XHRcdGNhc2UgS2V5Q29kZS5Ib21lOiBuZXh0SW5kZXggPSAwOyBicmVhaztcblx0XHRcdGNhc2UgS2V5Q29kZS5FbmQ6IG5leHRJbmRleCA9IHRoaXMuX3Jvd3MubGVuZ3RoIC0gMTsgYnJlYWs7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm47XG5cdFx0fVxuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0dGhpcy5fdXBkYXRlVGFiU3RvcHMobmV4dEluZGV4KTtcblx0XHR0aGlzLl9yb3dzW25leHRJbmRleF0/LmJ1dHRvbi5mb2N1cygpO1xuXHR9XG5cblx0c2V0QWN0aXZlKHJlcXVlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZlUmVxdWVzdElkID0gcmVxdWVzdElkO1xuXHRcdHRoaXMuX3VwZGF0ZUFjdGl2ZUNsYXNzZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUFjdGl2ZUNsYXNzZXMoKTogdm9pZCB7XG5cdFx0bGV0IGFjdGl2ZUluZGV4ID0gLTE7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9yb3dzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCByb3cgPSB0aGlzLl9yb3dzW2ldO1xuXHRcdFx0Y29uc3QgYWN0aXZlID0gdGhpcy5fYWN0aXZlUmVxdWVzdElkICE9PSB1bmRlZmluZWRcblx0XHRcdFx0JiYgKHJvdy50aWNrLnJlcXVlc3RJZCA9PT0gdGhpcy5fYWN0aXZlUmVxdWVzdElkIHx8IHJvdy50aWNrLmFsbFJlcXVlc3RJZHMuaW5jbHVkZXModGhpcy5fYWN0aXZlUmVxdWVzdElkKSk7XG5cdFx0XHRpZiAoYWN0aXZlKSB7XG5cdFx0XHRcdGFjdGl2ZUluZGV4ID0gaTtcblx0XHRcdH1cblx0XHRcdHJvdy5idXR0b24uY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgYWN0aXZlKTtcblx0XHRcdC8vIEV4cG9zZSB0aGUgY3VycmVudCBwcm9tcHQgdG8gYXNzaXN0aXZlIHRlY2gsIG1pcnJvcmluZyB0aGUgb3ZlcnZpZXctcnVsZXIgcmFpbC5cblx0XHRcdGlmIChhY3RpdmUpIHtcblx0XHRcdFx0cm93LmJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtY3VycmVudCcsICdsb2NhdGlvbicpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cm93LmJ1dHRvbi5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtY3VycmVudCcpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVBY3RpdmVEb3QoYWN0aXZlSW5kZXgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFjY2VudHMgdGhlIGRvdCBzdGFuZGluZyBmb3IgdGhlIHByb21wdCB0aGUgdHJhbnNjcmlwdCBpcyBzY3JvbGxlZCB0bywgc28gdGhlIHJlc3RpbmcgaGFuZGxlXG5cdCAqIHJlYWRzIGFzIGEgXCJ5b3UgYXJlIGhlcmVcIiBhbmQgdHJhY2tzIHNjcm9sbGluZy4gT25jZSB0aGUgZG90cyBhcmUgc2FtcGxlZFxuXHQgKiAoe0BsaW5rIE1BWF9SRVNUX0RPVFN9KSB0aGUgbmVhcmVzdCBkb3Qgc3RhbmRzIGluIGZvciB0aGUgYWN0aXZlIHByb21wdC5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZUFjdGl2ZURvdChhY3RpdmVJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0bGV0IGFjdGl2ZURvdCA9IC0xO1xuXHRcdGlmIChhY3RpdmVJbmRleCA+PSAwKSB7XG5cdFx0XHRsZXQgYmVzdERlbHRhID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9kb3RUaWNrcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBkZWx0YSA9IE1hdGguYWJzKHRoaXMuX2RvdFRpY2tzW2ldIC0gYWN0aXZlSW5kZXgpO1xuXHRcdFx0XHRpZiAoZGVsdGEgPCBiZXN0RGVsdGEpIHtcblx0XHRcdFx0XHRiZXN0RGVsdGEgPSBkZWx0YTtcblx0XHRcdFx0XHRhY3RpdmVEb3QgPSBpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fZG90cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5fZG90c1tpXS5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBpID09PSBhY3RpdmVEb3QpO1xuXHRcdH1cblx0fVxuXG5cdGZvY3VzVGljayhyZXF1ZXN0SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3Jvd3MuZmluZChyID0+IHIudGljay5yZXF1ZXN0SWQgPT09IHJlcXVlc3RJZCB8fCByLnRpY2suYWxsUmVxdWVzdElkcy5pbmNsdWRlcyhyZXF1ZXN0SWQpKT8uYnV0dG9uLmZvY3VzKCk7XG5cdH1cblxuXHRzZXRIb3N0V2lkdGgod2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh3aWR0aCA+IDAgJiYgd2lkdGggIT09IHRoaXMuX2hvc3RXaWR0aCkge1xuXHRcdFx0dGhpcy5faG9zdFdpZHRoID0gd2lkdGg7XG5cdFx0XHQvLyBUb28gbmFycm93IHRvIHBsYWNlIHRoZSBoYW5kbGUgYmVzaWRlIHRoZSBjb250ZW50OiBoaWRlIGl0ICh0aGUgbmF0aXZlIHNjcm9sbGJhciByZW1haW5zKS5cblx0XHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnb3ZlcmZsb3dpbmcnLCB3aWR0aCA8IE1JTl9IT1NUX1dJRFRIKTtcblx0XHR9XG5cdH1cblxuXHQvLyBUaGUgcnVsZXIgYmxvb21zIGl0cyBmYW4gb24gYSBoYXJkIHNjcm9sbCBhbmQgc2NhdHRlcnMgbWFya3MgYnkgc2Nyb2xsIHBvc2l0aW9uOyB0aGUgZG9jayBpcyBhXG5cdC8vIHN0YXRpYywgZXZlbmx5LXNwYWNlZCBsaXN0LCBzbyBib3RoIGFyZSBpbnRlbnRpb25hbGx5IG5vLW9wcy5cblx0bm90aWZ5SGFyZFdoZWVsKCk6IHZvaWQgeyB9XG5cdHNldFNjcm9sbExheW91dChfbGF5b3V0OiBJUHJvbXB0U2Nyb2xsTGF5b3V0IHwgdW5kZWZpbmVkKTogdm9pZCB7IH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsR0FBRyx1QkFBdUIsUUFBUSxXQUFXLFdBQVcsaUJBQWlCO0FBQ2xGLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsU0FBUyxhQUFhLHNCQUFzQjtBQUNyRCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBRy9CLE9BQU87QUFRUCxNQUFNLGdCQUFnQjtBQVV0QixJQUFJLFlBQVk7QUFtQlQsTUFBTSwrQkFBK0IsV0FBMEM7QUFBQSxFQStCckYsY0FBYztBQUNi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
