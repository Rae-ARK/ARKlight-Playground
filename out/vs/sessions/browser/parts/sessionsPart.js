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
import "./media/sessionsPart.css";
import { IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { IStorageService } from "../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { agentsPanelBorder } from "../../common/theme.js";
import { Parts } from "../../../workbench/services/layout/browser/layoutService.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
import { LayoutPriority } from "../../../base/browser/ui/splitview/splitview.js";
import { Direction, SerializableGrid, Sizing } from "../../../base/browser/ui/grid/grid.js";
import { Part } from "../../../workbench/browser/part.js";
import { ActiveSessionsContext, MultipleSessionsVisibleContext, SessionsFocusContext } from "../../common/contextkeys.js";
import { $, addDisposableGenericMouseDownListener, addDisposableListener, EventType, isAncestor, trackFocus } from "../../../base/browser/dom.js";
import { SessionView } from "./sessionView.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { Emitter } from "../../../base/common/event.js";
import { Color } from "../../../base/common/color.js";
import { contrastBorder } from "../../../platform/theme/common/colorRegistry.js";
import { SessionDropTarget } from "./sessionDropTarget.js";
import { ProgressBar } from "../../../base/browser/ui/progressbar/progressbar.js";
import { defaultProgressBarStyles } from "../../../platform/theme/browser/defaultStyles.js";
import { AbstractProgressScope, ScopedProgressIndicator } from "../../../workbench/services/progress/browser/progressIndicator.js";
import { observableValue } from "../../../base/common/observable.js";
import { IWorkbenchAssignmentService } from "../../../workbench/services/assignment/common/assignmentService.js";
import { IAgentWorkbenchLayoutService } from "../workbench.js";
import { applyAgentsPartCardStyles, getAgentsPartCardContentSize } from "./agentsPartCard.js";
const HARNESS_PICKER_IN_CONTROLS_TREATMENT = "agentSessionsHarnessPickerInControls";
let SessionsPart = class extends Part {
  constructor(themeService, storageService, agentWorkbenchLayoutService, contextKeyService, instantiationService, assignmentService) {
    super(
      Parts.SESSIONS_PART,
      { hasTitle: false, borderWidth: () => 0 },
      themeService,
      storageService,
      agentWorkbenchLayoutService
    );
    this.agentWorkbenchLayoutService = agentWorkbenchLayoutService;
    this.instantiationService = instantiationService;
    this.assignmentService = assignmentService;
    this.minimumWidth = 300;
    this.maximumWidth = Number.POSITIVE_INFINITY;
    this.minimumHeight = 0;
    this.maximumHeight = Number.POSITIVE_INFINITY;
    /**
     * Session views mounted in the grid, in display order (left-to-right). Slots
     * are reused across reconciliations: only the slot count changes with the
     * number of visible sessions; each slot is rebound to its session by position
     * via {@link SessionView.openSession}. There is always at least one slot — a
     * new-session placeholder (`boundSessionId === undefined`) when no sessions
     * are visible.
     */
    this._slots = [];
    this._onDidFocusSession = this._register(new Emitter());
    /** Fired when a session view in the grid receives keyboard focus. */
    this.onDidFocusSession = this._onDidFocusSession.event;
    /**
     * Whether the part itself is visible in the workbench grid. Starts `true`
     * because the workbench grid only calls {@link setVisible} on change.
     */
    this._isPartVisible = true;
    /**
     * Whether the session type ("harness") picker should be rendered below the
     * input (in the controls) instead of next to the workspace picker. Backed
     * by the {@link HARNESS_PICKER_IN_CONTROLS_TREATMENT} A/B experiment, which
     * is resolved asynchronously and updates this observable once it is known.
     * Passed down to new-chat views, which snapshot it at creation time.
     */
    this._renderSessionTypePickerInControls = observableValue(this, false);
    this.priority = LayoutPriority.High;
    ActiveSessionsContext.bindTo(contextKeyService);
    this._sessionsFocusKey = SessionsFocusContext.bindTo(contextKeyService);
    this._multipleSessionsVisibleKey = MultipleSessionsVisibleContext.bindTo(contextKeyService);
  }
  get snap() {
    return false;
  }
  get preferredHeight() {
    return this.layoutService.mainContainerDimension.height * 0.4;
  }
  /**
   * Resolve the harness-picker placement treatment now and whenever the
   * assignment service refetches. New-chat views snapshot the value when they
   * are created, so views mounted before the treatment resolves keep the
   * default placement until they are recreated.
   */
  _trackOptions() {
    const store = new DisposableStore();
    const updateHarnessPickerPlacement = async () => {
      const value = await this.assignmentService.getTreatment(HARNESS_PICKER_IN_CONTROLS_TREATMENT);
      this._renderSessionTypePickerInControls.set(value === true, void 0);
    };
    store.add(this.assignmentService.onDidRefetchAssignments(() => updateHarnessPickerPlacement()));
    updateHarnessPickerPlacement();
    return store;
  }
  create(parent) {
    this.element = parent;
    parent.classList.add("sessionspart");
    this._register(this._trackOptions());
    super.create(parent);
  }
  createContentArea(parent) {
    const contentArea = $(".content");
    parent.appendChild(contentArea);
    const focusTracker = this._register(trackFocus(contentArea));
    this._register(focusTracker.onDidFocus(() => this._sessionsFocusKey.set(true)));
    this._register(focusTracker.onDidBlur(() => this._sessionsFocusKey.set(false)));
    this._progressBar = this._register(new ProgressBar(contentArea, defaultProgressBarStyles));
    this._progressBar.hide();
    const placeholder = this._createSlot();
    this._gridWidget = this._register(new SerializableGrid(placeholder.view, { styles: { separatorBorder: this._gridSeparatorBorder } }));
    this._slots.push(placeholder);
    contentArea.appendChild(this._gridWidget.element);
    this._register(this._gridWidget.onDidChangeViewMaximized(() => this._updateMaximizedState()));
    const dropDelegate = {
      findTargetView: (child) => this._findTargetView(child)
    };
    this._register(this.instantiationService.createInstance(SessionDropTarget, contentArea, dropDelegate));
    return contentArea;
  }
  _findTargetView(child) {
    for (const slot of this._slots) {
      if (slot.boundSessionId === void 0) {
        continue;
      }
      if (isAncestor(child, slot.view.element)) {
        return { sessionId: slot.boundSessionId, element: slot.view.element };
      }
    }
    return void 0;
  }
  /**
   * Reconcile the grid with the desired set of visible sessions. Reuses the
   * existing {@link SessionView} slots, growing or shrinking the pool only when
   * the number of visible sessions changes, and rebinds each slot to its
   * session by position via {@link SessionView.openSession}.
   */
  updateVisibleSessions(visible, active) {
    if (!this._gridWidget) {
      return;
    }
    const desiredCount = Math.max(visible.length, 1);
    while (this._slots.length < desiredCount) {
      const slot = this._createSlot();
      const reference = this._slots[this._slots.length - 1].view;
      this._gridWidget.addView(slot.view, Sizing.Distribute, reference, Direction.Right);
      this._slots.push(slot);
    }
    while (this._slots.length > desiredCount) {
      const slot = this._slots.pop();
      this._gridWidget.removeView(slot.view, Sizing.Distribute);
      slot.disposables.dispose();
    }
    for (let i = 0; i < this._slots.length; i++) {
      const slot = this._slots[i];
      const session = visible[i];
      slot.boundSessionId = session?.sessionId;
      slot.view.openSession(session, { renderSessionTypePickerInControls: this._renderSessionTypePickerInControls });
    }
    const activeId = active?.sessionId;
    for (const slot of this._slots) {
      const isActive = slot.boundSessionId !== void 0 && slot.boundSessionId === activeId || this._slots.length === 1;
      slot.view.element.classList.toggle("is-active", isActive);
      slot.view.setActive(isActive);
    }
    if (this._gridWidget.hasMaximizedView()) {
      const maximizedSlot = this._slots.find((s) => this._gridWidget.isViewMaximized(s.view));
      if (maximizedSlot && maximizedSlot.boundSessionId !== activeId) {
        this._gridWidget.exitMaximizedView();
      }
    }
    this._updateContextKeys(visible);
  }
  _updateContextKeys(visible) {
    this._multipleSessionsVisibleKey.set(visible.length > 1);
  }
  /**
   * Pushes the grid's current maximized state into each {@link SessionView} so
   * its scoped `sessionIsMaximized` context key (used by toolbar actions) is
   * accurate. Called whenever the grid emits a maximize change.
   */
  _updateMaximizedState() {
    if (!this._gridWidget) {
      return;
    }
    for (const slot of this._slots) {
      slot.view.setMaximized(this._gridWidget.isViewMaximized(slot.view));
    }
  }
  /**
   * Toggles the maximized state of the session view hosting the given session.
   * If the view is already maximized, exits maximized state. Otherwise maximizes
   * it (no-op if fewer than two non-placeholder views are present).
   *
   * Returns the view's maximized state after the toggle, or `undefined` when
   * the call was a no-op.
   */
  toggleMaximizeSession(sessionId) {
    if (!this._gridWidget) {
      return void 0;
    }
    const slot = this._slots.find((s) => s.boundSessionId === sessionId);
    if (!slot) {
      return void 0;
    }
    if (this._gridWidget.isViewMaximized(slot.view)) {
      this._gridWidget.exitMaximizedView();
      return false;
    } else if (this._slots.filter((s) => s.boundSessionId !== void 0).length >= 2) {
      this._gridWidget.maximizeView(slot.view);
      slot.view.focus();
      return true;
    }
    return void 0;
  }
  /**
   * Returns the {@link SessionView} currently hosting the given session id, or
   * the placeholder (new-session) view when `sessionId` is `undefined`. Returns
   * `undefined` if no matching slot exists in the grid.
   */
  getSessionView(sessionId) {
    return this._slots.find((s) => s.boundSessionId === sessionId)?.view;
  }
  /**
   * Moves keyboard focus into the session view hosting the given session id (or
   * the placeholder view when `sessionId` is `undefined`), first revealing it in
   * the grid when it is only partially visible. No-op if no matching slot exists.
   */
  focusSession(sessionId) {
    const slot = this._slots.find((s) => s.boundSessionId === sessionId);
    if (!slot) {
      return;
    }
    this._revealView(slot.view);
    slot.view.focus();
  }
  /**
   * Ensures the given view is fully visible within the grid. The grid clips its
   * leaves (`overflow: hidden`) and lays them out side by side; when there are
   * more sessions than fit, the grid's split view overflows horizontally and
   * becomes scrollable, leaving views near the edges partially hidden. When the
   * target view is not fully visible, scroll it into view.
   */
  _revealView(view) {
    if (!this._gridWidget) {
      return;
    }
    const containerRect = this._gridWidget.element.getBoundingClientRect();
    const viewRect = view.element.getBoundingClientRect();
    const isFullyVisible = viewRect.left >= containerRect.left - 1 && viewRect.right <= containerRect.right + 1;
    if (!isFullyVisible) {
      view.element.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }
  /**
   * Returns the progress indicator for the part. Drives the progress bar shown
   * at the top of the content area. Indicator state is scoped to the part's
   * visibility, mirroring how view panes manage their own progress indicators.
   */
  getProgressIndicator() {
    if (!this._progressIndicator) {
      const progressBar = assertReturnsDefined(this._progressBar);
      const scopeId = Parts.SESSIONS_PART;
      const isVisible = this.layoutService.isVisible(scopeId);
      const onDidVisibilityChange = this.onDidVisibilityChange;
      const scope = this._register(new class extends AbstractProgressScope {
        constructor() {
          super(scopeId, isVisible);
          this._register(onDidVisibilityChange((visible) => visible ? this.onScopeOpened(scopeId) : this.onScopeClosed(scopeId)));
        }
      }());
      this._progressIndicator = this._register(new ScopedProgressIndicator(progressBar, scope));
    }
    return this._progressIndicator;
  }
  _createSlot() {
    const disposables = new DisposableStore();
    const view = disposables.add(this.instantiationService.createInstance(SessionView));
    view.setPartVisible(this._isPartVisible);
    const slot = { view, disposables, boundSessionId: void 0 };
    const fireFocus = () => {
      if (slot.boundSessionId !== void 0) {
        this._onDidFocusSession.fire(slot.boundSessionId);
      }
    };
    disposables.add(addDisposableListener(view.element, EventType.FOCUS_IN, fireFocus, true));
    disposables.add(addDisposableGenericMouseDownListener(view.element, fireFocus, true));
    return slot;
  }
  get _gridSeparatorBorder() {
    return this.theme.getColor(agentsPanelBorder) || this.theme.getColor(contrastBorder) || Color.transparent;
  }
  updateStyles() {
    super.updateStyles();
    const container = assertReturnsDefined(this.getContainer());
    applyAgentsPartCardStyles(container, this.theme);
    this._gridWidget?.style({ separatorBorder: this._gridSeparatorBorder });
  }
  setVisible(visible) {
    if (this._isPartVisible !== visible) {
      this._isPartVisible = visible;
      for (const slot of this._slots) {
        slot.view.setPartVisible(visible);
      }
    }
    super.setVisible(visible);
  }
  layout(width, height, top, left) {
    if (!this.layoutService.isVisible(Parts.SESSIONS_PART)) {
      return;
    }
    this._lastLayout = { width, height, top, left };
    const cardSize = getAgentsPartCardContentSize(width, height, this.agentWorkbenchLayoutService.isEditorPaneVisible());
    const { contentSize } = this.layoutContents(cardSize.width, cardSize.height);
    this._gridWidget?.layout(contentSize.width, contentSize.height, top, left);
    super.layout(width, height, top, left);
  }
  dispose() {
    for (const slot of this._slots) {
      slot.disposables.dispose();
    }
    this._slots.length = 0;
    super.dispose();
  }
  toJSON() {
    return {
      type: Parts.SESSIONS_PART
    };
  }
};
/** Border width on the card (1px each side) */
SessionsPart.BORDER_WIDTH = 1;
SessionsPart = __decorateClass([
  __decorateParam(0, IThemeService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IAgentWorkbenchLayoutService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IWorkbenchAssignmentService)
], SessionsPart);
export {
  SessionsPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2Jyb3dzZXIvcGFydHMvc2Vzc2lvbnNQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3Nlc3Npb25zUGFydC5jc3MnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFnZW50c1BhbmVsQm9yZGVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBMYXlvdXRQcmlvcml0eSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zcGxpdHZpZXcvc3BsaXR2aWV3LmpzJztcbmltcG9ydCB7IERpcmVjdGlvbiwgU2VyaWFsaXphYmxlR3JpZCwgU2l6aW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2dyaWQvZ3JpZC5qcyc7XG5pbXBvcnQgeyBQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydC5qcyc7XG5pbXBvcnQgeyBBY3RpdmVTZXNzaW9uc0NvbnRleHQsIE11bHRpcGxlU2Vzc2lvbnNWaXNpYmxlQ29udGV4dCwgU2Vzc2lvbnNGb2N1c0NvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lciwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIGlzQW5jZXN0b3IsIHRyYWNrRm9jdXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uVmlldyB9IGZyb20gJy4vc2Vzc2lvblZpZXcuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgY29udHJhc3RCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uRHJvcFRhcmdldCwgSVNlc3Npb25Ecm9wVGFyZ2V0RGVsZWdhdGUgfSBmcm9tICcuL3Nlc3Npb25Ecm9wVGFyZ2V0LmpzJztcbmltcG9ydCB7IFByb2dyZXNzQmFyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Byb2dyZXNzYmFyL3Byb2dyZXNzYmFyLmpzJztcbmltcG9ydCB7IGRlZmF1bHRQcm9ncmVzc0JhclN0eWxlcyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NJbmRpY2F0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RQcm9ncmVzc1Njb3BlLCBTY29wZWRQcm9ncmVzc0luZGljYXRvciB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9wcm9ncmVzcy9icm93c2VyL3Byb2dyZXNzSW5kaWNhdG9yLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi93b3JrYmVuY2guanMnO1xuaW1wb3J0IHsgYXBwbHlBZ2VudHNQYXJ0Q2FyZFN0eWxlcywgZ2V0QWdlbnRzUGFydENhcmRDb250ZW50U2l6ZSB9IGZyb20gJy4vYWdlbnRzUGFydENhcmQuanMnO1xuXG4vKipcbiAqIEV4UCB0cmVhdG1lbnQgdGhhdCwgd2hlbiBlbmFibGVkLCBtb3ZlcyB0aGUgc2Vzc2lvbiB0eXBlIChcImhhcm5lc3NcIikgcGlja2VyXG4gKiBmcm9tIGl0cyBkZWZhdWx0IHNwb3QgbmV4dCB0byB0aGUgd29ya3NwYWNlIHBpY2tlciBkb3duIGludG8gdGhlIGJvdHRvbSBpbnB1dFxuICogY29udHJvbHMgKGFuZCBkcm9wcyB0aGUgXCJ3aXRoXCIgY29ubmVjdG9yIGxhYmVsKS4gUmVzb2x2ZWQgb25jZSB2aWEgdGhlXG4gKiB7QGxpbmsgSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlfSBhbmQgc3VyZmFjZWQgdG8gbmV3LWNoYXQgdmlld3MgdGhyb3VnaFxuICogdGhlIG5ldy1jaGF0IHZpZXcgb3B0aW9ucy5cbiAqL1xuY29uc3QgSEFSTkVTU19QSUNLRVJfSU5fQ09OVFJPTFNfVFJFQVRNRU5UID0gJ2FnZW50U2Vzc2lvbnNIYXJuZXNzUGlja2VySW5Db250cm9scyc7XG5cbmludGVyZmFjZSBJR3JpZFNsb3Qge1xuXHRyZWFkb25seSB2aWV3OiBTZXNzaW9uVmlldztcblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0LyoqIFNlc3Npb24gY3VycmVudGx5IGJvdW5kIHRvIHRoaXMgc2xvdCwgb3IgYHVuZGVmaW5lZGAgZm9yIHRoZSBuZXctc2Vzc2lvbiBwbGFjZWhvbGRlci4gKi9cblx0Ym91bmRTZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIFNlc3Npb25zUGFydCBleHRlbmRzIFBhcnQge1xuXG5cdG92ZXJyaWRlIHJlYWRvbmx5IG1pbmltdW1XaWR0aDogbnVtYmVyID0gMzAwO1xuXHRvdmVycmlkZSByZWFkb25seSBtYXhpbXVtV2lkdGg6IG51bWJlciA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgbWluaW11bUhlaWdodDogbnVtYmVyID0gMDtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgbWF4aW11bUhlaWdodDogbnVtYmVyID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXHRnZXQgc25hcCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cblx0LyoqIEJvcmRlciB3aWR0aCBvbiB0aGUgY2FyZCAoMXB4IGVhY2ggc2lkZSkgKi9cblx0c3RhdGljIHJlYWRvbmx5IEJPUkRFUl9XSURUSCA9IDE7XG5cblx0LyoqIEludGVybmFsIGdyaWQgdGhhdCBob3N0cyB0aGUgcGFydCdzIHNlc3Npb24gdmlld3MuICovXG5cdHByb3RlY3RlZCBfZ3JpZFdpZGdldDogU2VyaWFsaXphYmxlR3JpZDxTZXNzaW9uVmlldz4gfCB1bmRlZmluZWQ7XG5cblx0LyoqIExhemlseS1jcmVhdGVkIHByb2dyZXNzIGJhciBzaG93biBhdCB0aGUgdG9wIG9mIHRoZSBjb250ZW50IGFyZWEuICovXG5cdHByaXZhdGUgX3Byb2dyZXNzQmFyOiBQcm9ncmVzc0JhciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHJvZ3Jlc3NJbmRpY2F0b3I6IElQcm9ncmVzc0luZGljYXRvciB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogU2Vzc2lvbiB2aWV3cyBtb3VudGVkIGluIHRoZSBncmlkLCBpbiBkaXNwbGF5IG9yZGVyIChsZWZ0LXRvLXJpZ2h0KS4gU2xvdHNcblx0ICogYXJlIHJldXNlZCBhY3Jvc3MgcmVjb25jaWxpYXRpb25zOiBvbmx5IHRoZSBzbG90IGNvdW50IGNoYW5nZXMgd2l0aCB0aGVcblx0ICogbnVtYmVyIG9mIHZpc2libGUgc2Vzc2lvbnM7IGVhY2ggc2xvdCBpcyByZWJvdW5kIHRvIGl0cyBzZXNzaW9uIGJ5IHBvc2l0aW9uXG5cdCAqIHZpYSB7QGxpbmsgU2Vzc2lvblZpZXcub3BlblNlc3Npb259LiBUaGVyZSBpcyBhbHdheXMgYXQgbGVhc3Qgb25lIHNsb3QgXHUyMDE0IGFcblx0ICogbmV3LXNlc3Npb24gcGxhY2Vob2xkZXIgKGBib3VuZFNlc3Npb25JZCA9PT0gdW5kZWZpbmVkYCkgd2hlbiBubyBzZXNzaW9uc1xuXHQgKiBhcmUgdmlzaWJsZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nsb3RzOiBJR3JpZFNsb3RbXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRm9jdXNTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0LyoqIEZpcmVkIHdoZW4gYSBzZXNzaW9uIHZpZXcgaW4gdGhlIGdyaWQgcmVjZWl2ZXMga2V5Ym9hcmQgZm9jdXMuICovXG5cdHJlYWRvbmx5IG9uRGlkRm9jdXNTZXNzaW9uOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EaWRGb2N1c1Nlc3Npb24uZXZlbnQ7XG5cblx0cHJvdGVjdGVkIF9sYXN0TGF5b3V0OiB7IHJlYWRvbmx5IHdpZHRoOiBudW1iZXI7IHJlYWRvbmx5IGhlaWdodDogbnVtYmVyOyByZWFkb25seSB0b3A6IG51bWJlcjsgcmVhZG9ubHkgbGVmdDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbXVsdGlwbGVTZXNzaW9uc1Zpc2libGVLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc0ZvY3VzS2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgcGFydCBpdHNlbGYgaXMgdmlzaWJsZSBpbiB0aGUgd29ya2JlbmNoIGdyaWQuIFN0YXJ0cyBgdHJ1ZWBcblx0ICogYmVjYXVzZSB0aGUgd29ya2JlbmNoIGdyaWQgb25seSBjYWxscyB7QGxpbmsgc2V0VmlzaWJsZX0gb24gY2hhbmdlLlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNQYXJ0VmlzaWJsZSA9IHRydWU7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHNlc3Npb24gdHlwZSAoXCJoYXJuZXNzXCIpIHBpY2tlciBzaG91bGQgYmUgcmVuZGVyZWQgYmVsb3cgdGhlXG5cdCAqIGlucHV0IChpbiB0aGUgY29udHJvbHMpIGluc3RlYWQgb2YgbmV4dCB0byB0aGUgd29ya3NwYWNlIHBpY2tlci4gQmFja2VkXG5cdCAqIGJ5IHRoZSB7QGxpbmsgSEFSTkVTU19QSUNLRVJfSU5fQ09OVFJPTFNfVFJFQVRNRU5UfSBBL0IgZXhwZXJpbWVudCwgd2hpY2hcblx0ICogaXMgcmVzb2x2ZWQgYXN5bmNocm9ub3VzbHkgYW5kIHVwZGF0ZXMgdGhpcyBvYnNlcnZhYmxlIG9uY2UgaXQgaXMga25vd24uXG5cdCAqIFBhc3NlZCBkb3duIHRvIG5ldy1jaGF0IHZpZXdzLCB3aGljaCBzbmFwc2hvdCBpdCBhdCBjcmVhdGlvbiB0aW1lLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVyU2Vzc2lvblR5cGVQaWNrZXJJbkNvbnRyb2xzID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KHRoaXMsIGZhbHNlKTtcblxuXHRnZXQgcHJlZmVycmVkSGVpZ2h0KCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyRGltZW5zaW9uLmhlaWdodCAqIDAuNDtcblx0fVxuXG5cdHJlYWRvbmx5IHByaW9yaXR5ID0gTGF5b3V0UHJpb3JpdHkuSGlnaDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlOiBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXNzaWdubWVudFNlcnZpY2U6IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRQYXJ0cy5TRVNTSU9OU19QQVJULFxuXHRcdFx0eyBoYXNUaXRsZTogZmFsc2UsIGJvcmRlcldpZHRoOiAoKSA9PiAwIH0sXG5cdFx0XHR0aGVtZVNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZVxuXHRcdCk7XG5cblx0XHQvLyBCaW5kIGNvbnRleHQga2V5cyBmb3IgY29tcGF0aWJpbGl0eSB3aXRoIGV4aXN0aW5nIHdoZW4tY2xhdXNlc1xuXHRcdEFjdGl2ZVNlc3Npb25zQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3Nlc3Npb25zRm9jdXNLZXkgPSBTZXNzaW9uc0ZvY3VzQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX211bHRpcGxlU2Vzc2lvbnNWaXNpYmxlS2V5ID0gTXVsdGlwbGVTZXNzaW9uc1Zpc2libGVDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgaGFybmVzcy1waWNrZXIgcGxhY2VtZW50IHRyZWF0bWVudCBub3cgYW5kIHdoZW5ldmVyIHRoZVxuXHQgKiBhc3NpZ25tZW50IHNlcnZpY2UgcmVmZXRjaGVzLiBOZXctY2hhdCB2aWV3cyBzbmFwc2hvdCB0aGUgdmFsdWUgd2hlbiB0aGV5XG5cdCAqIGFyZSBjcmVhdGVkLCBzbyB2aWV3cyBtb3VudGVkIGJlZm9yZSB0aGUgdHJlYXRtZW50IHJlc29sdmVzIGtlZXAgdGhlXG5cdCAqIGRlZmF1bHQgcGxhY2VtZW50IHVudGlsIHRoZXkgYXJlIHJlY3JlYXRlZC5cblx0ICovXG5cdHByaXZhdGUgX3RyYWNrT3B0aW9ucygpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBIYXJuZXNzIHBpY2tlciBwbGFjZW1lbnRcblx0XHRjb25zdCB1cGRhdGVIYXJuZXNzUGlja2VyUGxhY2VtZW50ID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLmFzc2lnbm1lbnRTZXJ2aWNlLmdldFRyZWF0bWVudDxib29sZWFuPihIQVJORVNTX1BJQ0tFUl9JTl9DT05UUk9MU19UUkVBVE1FTlQpO1xuXHRcdFx0dGhpcy5fcmVuZGVyU2Vzc2lvblR5cGVQaWNrZXJJbkNvbnRyb2xzLnNldCh2YWx1ZSA9PT0gdHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHR9O1xuXHRcdHN0b3JlLmFkZCh0aGlzLmFzc2lnbm1lbnRTZXJ2aWNlLm9uRGlkUmVmZXRjaEFzc2lnbm1lbnRzKCgpID0+IHVwZGF0ZUhhcm5lc3NQaWNrZXJQbGFjZW1lbnQoKSkpO1xuXHRcdHVwZGF0ZUhhcm5lc3NQaWNrZXJQbGFjZW1lbnQoKTtcblxuXHRcdHJldHVybiBzdG9yZTtcblx0fVxuXG5cdG92ZXJyaWRlIGNyZWF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50ID0gcGFyZW50O1xuXHRcdHBhcmVudC5jbGFzc0xpc3QuYWRkKCdzZXNzaW9uc3BhcnQnKTtcblxuXHRcdC8vIFJlc29sdmUgdHJlYXRtZW50cyBoZXJlIHJhdGhlciB0aGFuIGluIHRoZSBjb25zdHJ1Y3RvcjogdG91Y2hpbmcgdGhlXG5cdFx0Ly8gYXNzaWdubWVudCBzZXJ2aWNlIGZvcmNlcyBpdCAoYW5kIGl0cyBlYWdlcmx5LWNvbnN0cnVjdGVkIGZpbHRlclxuXHRcdC8vIHByb3ZpZGVycykgdG8gaW5zdGFudGlhdGUuIERvaW5nIHRoYXQgZHVyaW5nIHRoZSBwYXJ0J3MgY29uc3RydWN0aW9uIFx1MjAxNFxuXHRcdC8vIHdoaWNoIHJ1bnMgd2hpbGUgdGhlIHdvcmtiZW5jaCBsYXlvdXQgaXMgYmVpbmcgaW5pdGlhbGl6ZWQgXHUyMDE0IGhhcyBiZWVuXG5cdFx0Ly8gb2JzZXJ2ZWQgdG8gdHJpZ2dlciByZS1lbnRyYW5jeSBpc3N1ZXMgaW4gZW50aXRsZW1lbnQtZGVwZW5kZW50IGZpbHRlclxuXHRcdC8vIHByb3ZpZGVycy4gYGNyZWF0ZSgpYCBydW5zIGxhdGVyLCBvbmNlIGxheW91dCBpbml0IGhhcyBzZXR0bGVkLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RyYWNrT3B0aW9ucygpKTtcblxuXHRcdHN1cGVyLmNyZWF0ZShwYXJlbnQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUNvbnRlbnRBcmVhKHBhcmVudDogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgY29udGVudEFyZWEgPSAkKCcuY29udGVudCcpO1xuXHRcdHBhcmVudC5hcHBlbmRDaGlsZChjb250ZW50QXJlYSk7XG5cblx0XHQvLyBUcmFjayBrZXlib2FyZCBmb2N1cyB3aXRoaW4gdGhlIHNlc3Npb25zIGNvbnRlbnQgc28gdGhlIGBzZXNzaW9uc0ZvY3VzYFxuXHRcdC8vIGNvbnRleHQga2V5IHJlZmxlY3RzIHdoZXRoZXIgYSBzZXNzaW9uIChpdHMgY2hhdCB2aWV3KSBjdXJyZW50bHkgaGFzIGZvY3VzLlxuXHRcdGNvbnN0IGZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKHRyYWNrRm9jdXMoY29udGVudEFyZWEpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB0aGlzLl9zZXNzaW9uc0ZvY3VzS2V5LnNldCh0cnVlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4gdGhpcy5fc2Vzc2lvbnNGb2N1c0tleS5zZXQoZmFsc2UpKSk7XG5cblx0XHQvLyBQcm9ncmVzcyBiYXIgcGlubmVkIHRvIHRoZSB0b3Agb2YgdGhlIGNvbnRlbnQgYXJlYSAoc2VlIHNlc3Npb25zUGFydC5jc3Ncblx0XHQvLyBydWxlIGAucGFydC5zZXNzaW9uc3BhcnQgPiAuY29udGVudCA+IC5tb25hY28tcHJvZ3Jlc3MtY29udGFpbmVyYCkuXG5cdFx0dGhpcy5fcHJvZ3Jlc3NCYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUHJvZ3Jlc3NCYXIoY29udGVudEFyZWEsIGRlZmF1bHRQcm9ncmVzc0JhclN0eWxlcykpO1xuXHRcdHRoaXMuX3Byb2dyZXNzQmFyLmhpZGUoKTtcblxuXHRcdC8vIFNlZWQgdGhlIGdyaWQgd2l0aCBhIHBsYWNlaG9sZGVyIHNsb3Qgc28gU2VyaWFsaXphYmxlR3JpZCBhbHdheXMgaGFzXG5cdFx0Ly8gYXQgbGVhc3Qgb25lIGxlYWYuIFJlYm91bmQgdG8gYSBzZXNzaW9uIHdoZW4gdmlzaWJsZSBzZXNzaW9ucyBhcHBlYXIuXG5cdFx0Y29uc3QgcGxhY2Vob2xkZXIgPSB0aGlzLl9jcmVhdGVTbG90KCk7XG5cdFx0dGhpcy5fZ3JpZFdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTZXJpYWxpemFibGVHcmlkKHBsYWNlaG9sZGVyLnZpZXcsIHsgc3R5bGVzOiB7IHNlcGFyYXRvckJvcmRlcjogdGhpcy5fZ3JpZFNlcGFyYXRvckJvcmRlciB9IH0pKTtcblx0XHR0aGlzLl9zbG90cy5wdXNoKHBsYWNlaG9sZGVyKTtcblx0XHRjb250ZW50QXJlYS5hcHBlbmRDaGlsZCh0aGlzLl9ncmlkV2lkZ2V0LmVsZW1lbnQpO1xuXG5cdFx0Ly8gUHJvcGFnYXRlIHRoZSBncmlkJ3MgbWF4aW1pemVkLXZpZXcgc3RhdGUgdG8gZWFjaCBzZXNzaW9uIHZpZXcgc28gdGhlXG5cdFx0Ly8gcGVyLXZpZXcgdG9vbGJhcnMgY2FuIHJlbmRlciB0aGUgbWF4aW1pemUgYWN0aW9uIGluIGl0cyB0b2dnbGVkIHN0YXRlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2dyaWRXaWRnZXQub25EaWRDaGFuZ2VWaWV3TWF4aW1pemVkKCgpID0+IHRoaXMuX3VwZGF0ZU1heGltaXplZFN0YXRlKCkpKTtcblxuXHRcdC8vIERyb3AgdGFyZ2V0IGZvciByZWNlaXZpbmcgc2Vzc2lvbnMgZHJhZ2dlZCBmcm9tIHRoZSBzZXNzaW9ucyBsaXN0LlxuXHRcdGNvbnN0IGRyb3BEZWxlZ2F0ZTogSVNlc3Npb25Ecm9wVGFyZ2V0RGVsZWdhdGUgPSB7XG5cdFx0XHRmaW5kVGFyZ2V0VmlldzogKGNoaWxkOiBIVE1MRWxlbWVudCkgPT4gdGhpcy5fZmluZFRhcmdldFZpZXcoY2hpbGQpLFxuXHRcdH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uRHJvcFRhcmdldCwgY29udGVudEFyZWEsIGRyb3BEZWxlZ2F0ZSkpO1xuXG5cdFx0cmV0dXJuIGNvbnRlbnRBcmVhO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZFRhcmdldFZpZXcoY2hpbGQ6IEhUTUxFbGVtZW50KTogeyByZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZzsgcmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBzbG90IG9mIHRoaXMuX3Nsb3RzKSB7XG5cdFx0XHRpZiAoc2xvdC5ib3VuZFNlc3Npb25JZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQW5jZXN0b3IoY2hpbGQsIHNsb3Qudmlldy5lbGVtZW50KSkge1xuXHRcdFx0XHRyZXR1cm4geyBzZXNzaW9uSWQ6IHNsb3QuYm91bmRTZXNzaW9uSWQsIGVsZW1lbnQ6IHNsb3Qudmlldy5lbGVtZW50IH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmVjb25jaWxlIHRoZSBncmlkIHdpdGggdGhlIGRlc2lyZWQgc2V0IG9mIHZpc2libGUgc2Vzc2lvbnMuIFJldXNlcyB0aGVcblx0ICogZXhpc3Rpbmcge0BsaW5rIFNlc3Npb25WaWV3fSBzbG90cywgZ3Jvd2luZyBvciBzaHJpbmtpbmcgdGhlIHBvb2wgb25seSB3aGVuXG5cdCAqIHRoZSBudW1iZXIgb2YgdmlzaWJsZSBzZXNzaW9ucyBjaGFuZ2VzLCBhbmQgcmViaW5kcyBlYWNoIHNsb3QgdG8gaXRzXG5cdCAqIHNlc3Npb24gYnkgcG9zaXRpb24gdmlhIHtAbGluayBTZXNzaW9uVmlldy5vcGVuU2Vzc2lvbn0uXG5cdCAqL1xuXHR1cGRhdGVWaXNpYmxlU2Vzc2lvbnModmlzaWJsZTogcmVhZG9ubHkgKElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKVtdLCBhY3RpdmU6IElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9ncmlkV2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQWx3YXlzIGtlZXAgYXQgbGVhc3Qgb25lIHNsb3QgKGEgcGxhY2Vob2xkZXIgd2hlbiBubyBzZXNzaW9ucyBhcmUgdmlzaWJsZSkuXG5cdFx0Y29uc3QgZGVzaXJlZENvdW50ID0gTWF0aC5tYXgodmlzaWJsZS5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gR3JvdyB0aGUgcG9vbCBieSBhcHBlbmRpbmcgbmV3IHNsb3RzIHRvIHRoZSByaWdodC5cblx0XHR3aGlsZSAodGhpcy5fc2xvdHMubGVuZ3RoIDwgZGVzaXJlZENvdW50KSB7XG5cdFx0XHRjb25zdCBzbG90ID0gdGhpcy5fY3JlYXRlU2xvdCgpO1xuXHRcdFx0Y29uc3QgcmVmZXJlbmNlID0gdGhpcy5fc2xvdHNbdGhpcy5fc2xvdHMubGVuZ3RoIC0gMV0udmlldztcblx0XHRcdHRoaXMuX2dyaWRXaWRnZXQuYWRkVmlldyhzbG90LnZpZXcsIFNpemluZy5EaXN0cmlidXRlLCByZWZlcmVuY2UsIERpcmVjdGlvbi5SaWdodCk7XG5cdFx0XHR0aGlzLl9zbG90cy5wdXNoKHNsb3QpO1xuXHRcdH1cblxuXHRcdC8vIFNocmluayB0aGUgcG9vbCBieSByZW1vdmluZyB0cmFpbGluZyBzbG90cyAoYWx3YXlzIGxlYXZlcyBhdCBsZWFzdCBvbmUpLlxuXHRcdHdoaWxlICh0aGlzLl9zbG90cy5sZW5ndGggPiBkZXNpcmVkQ291bnQpIHtcblx0XHRcdGNvbnN0IHNsb3QgPSB0aGlzLl9zbG90cy5wb3AoKSE7XG5cdFx0XHR0aGlzLl9ncmlkV2lkZ2V0LnJlbW92ZVZpZXcoc2xvdC52aWV3LCBTaXppbmcuRGlzdHJpYnV0ZSk7XG5cdFx0XHRzbG90LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHQvLyBSZWJpbmQgZWFjaCBzbG90IHRvIGl0cyBzZXNzaW9uIGJ5IHBvc2l0aW9uIChvciB0byB1bmRlZmluZWQgcGxhY2Vob2xkZXIpLlxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc2xvdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHNsb3QgPSB0aGlzLl9zbG90c1tpXTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aXNpYmxlW2ldO1xuXHRcdFx0c2xvdC5ib3VuZFNlc3Npb25JZCA9IHNlc3Npb24/LnNlc3Npb25JZDtcblx0XHRcdHNsb3Qudmlldy5vcGVuU2Vzc2lvbihzZXNzaW9uLCB7IHJlbmRlclNlc3Npb25UeXBlUGlja2VySW5Db250cm9sczogdGhpcy5fcmVuZGVyU2Vzc2lvblR5cGVQaWNrZXJJbkNvbnRyb2xzIH0pO1xuXHRcdH1cblxuXHRcdC8vIE1hcmsgdGhlIGFjdGl2ZSBzZXNzaW9uJ3MgZWxlbWVudCBmb3Igc3R5bGluZy9mb2N1cyBpbmRpY2F0aW9uLlxuXHRcdGNvbnN0IGFjdGl2ZUlkID0gYWN0aXZlPy5zZXNzaW9uSWQ7XG5cdFx0Zm9yIChjb25zdCBzbG90IG9mIHRoaXMuX3Nsb3RzKSB7XG5cdFx0XHRjb25zdCBpc0FjdGl2ZSA9IChzbG90LmJvdW5kU2Vzc2lvbklkICE9PSB1bmRlZmluZWQgJiYgc2xvdC5ib3VuZFNlc3Npb25JZCA9PT0gYWN0aXZlSWQpIHx8IHRoaXMuX3Nsb3RzLmxlbmd0aCA9PT0gMTtcblx0XHRcdHNsb3Qudmlldy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2lzLWFjdGl2ZScsIGlzQWN0aXZlKTtcblx0XHRcdHNsb3Qudmlldy5zZXRBY3RpdmUoaXNBY3RpdmUpO1xuXHRcdH1cblxuXHRcdC8vIEV4aXQgdGhlIGdyaWQncyBtYXhpbWl6ZWQgc3RhdGUgd2hlbiB0aGUgYWN0aXZlIHNlc3Npb24gbGFuZHMgaW4gYVxuXHRcdC8vIGRpZmZlcmVudCBzbG90IHRoYW4gdGhlIG1heGltaXplZCBvbmUuIE9wZW5pbmcgYSBzZXNzaW9uIGludG8gdGhlXG5cdFx0Ly8gY3VycmVudGx5LW1heGltaXplZCBzbG90IHByZXNlcnZlcyB0aGUgbWF4aW1pemVkIHN0YXRlLlxuXHRcdGlmICh0aGlzLl9ncmlkV2lkZ2V0Lmhhc01heGltaXplZFZpZXcoKSkge1xuXHRcdFx0Y29uc3QgbWF4aW1pemVkU2xvdCA9IHRoaXMuX3Nsb3RzLmZpbmQocyA9PiB0aGlzLl9ncmlkV2lkZ2V0IS5pc1ZpZXdNYXhpbWl6ZWQocy52aWV3KSk7XG5cdFx0XHRpZiAobWF4aW1pemVkU2xvdCAmJiBtYXhpbWl6ZWRTbG90LmJvdW5kU2Vzc2lvbklkICE9PSBhY3RpdmVJZCkge1xuXHRcdFx0XHR0aGlzLl9ncmlkV2lkZ2V0LmV4aXRNYXhpbWl6ZWRWaWV3KCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fdXBkYXRlQ29udGV4dEtleXModmlzaWJsZSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDb250ZXh0S2V5cyh2aXNpYmxlOiByZWFkb25seSAoSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpW10pOiB2b2lkIHtcblx0XHR0aGlzLl9tdWx0aXBsZVNlc3Npb25zVmlzaWJsZUtleS5zZXQodmlzaWJsZS5sZW5ndGggPiAxKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQdXNoZXMgdGhlIGdyaWQncyBjdXJyZW50IG1heGltaXplZCBzdGF0ZSBpbnRvIGVhY2gge0BsaW5rIFNlc3Npb25WaWV3fSBzb1xuXHQgKiBpdHMgc2NvcGVkIGBzZXNzaW9uSXNNYXhpbWl6ZWRgIGNvbnRleHQga2V5ICh1c2VkIGJ5IHRvb2xiYXIgYWN0aW9ucykgaXNcblx0ICogYWNjdXJhdGUuIENhbGxlZCB3aGVuZXZlciB0aGUgZ3JpZCBlbWl0cyBhIG1heGltaXplIGNoYW5nZS5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZU1heGltaXplZFN0YXRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZ3JpZFdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHNsb3Qgb2YgdGhpcy5fc2xvdHMpIHtcblx0XHRcdHNsb3Qudmlldy5zZXRNYXhpbWl6ZWQodGhpcy5fZ3JpZFdpZGdldC5pc1ZpZXdNYXhpbWl6ZWQoc2xvdC52aWV3KSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRvZ2dsZXMgdGhlIG1heGltaXplZCBzdGF0ZSBvZiB0aGUgc2Vzc2lvbiB2aWV3IGhvc3RpbmcgdGhlIGdpdmVuIHNlc3Npb24uXG5cdCAqIElmIHRoZSB2aWV3IGlzIGFscmVhZHkgbWF4aW1pemVkLCBleGl0cyBtYXhpbWl6ZWQgc3RhdGUuIE90aGVyd2lzZSBtYXhpbWl6ZXNcblx0ICogaXQgKG5vLW9wIGlmIGZld2VyIHRoYW4gdHdvIG5vbi1wbGFjZWhvbGRlciB2aWV3cyBhcmUgcHJlc2VudCkuXG5cdCAqXG5cdCAqIFJldHVybnMgdGhlIHZpZXcncyBtYXhpbWl6ZWQgc3RhdGUgYWZ0ZXIgdGhlIHRvZ2dsZSwgb3IgYHVuZGVmaW5lZGAgd2hlblxuXHQgKiB0aGUgY2FsbCB3YXMgYSBuby1vcC5cblx0ICovXG5cdHRvZ2dsZU1heGltaXplU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fZ3JpZFdpZGdldCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2xvdCA9IHRoaXMuX3Nsb3RzLmZpbmQocyA9PiBzLmJvdW5kU2Vzc2lvbklkID09PSBzZXNzaW9uSWQpO1xuXHRcdGlmICghc2xvdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2dyaWRXaWRnZXQuaXNWaWV3TWF4aW1pemVkKHNsb3QudmlldykpIHtcblx0XHRcdHRoaXMuX2dyaWRXaWRnZXQuZXhpdE1heGltaXplZFZpZXcoKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX3Nsb3RzLmZpbHRlcihzID0+IHMuYm91bmRTZXNzaW9uSWQgIT09IHVuZGVmaW5lZCkubGVuZ3RoID49IDIpIHtcblx0XHRcdHRoaXMuX2dyaWRXaWRnZXQubWF4aW1pemVWaWV3KHNsb3Qudmlldyk7XG5cdFx0XHRzbG90LnZpZXcuZm9jdXMoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHtAbGluayBTZXNzaW9uVmlld30gY3VycmVudGx5IGhvc3RpbmcgdGhlIGdpdmVuIHNlc3Npb24gaWQsIG9yXG5cdCAqIHRoZSBwbGFjZWhvbGRlciAobmV3LXNlc3Npb24pIHZpZXcgd2hlbiBgc2Vzc2lvbklkYCBpcyBgdW5kZWZpbmVkYC4gUmV0dXJuc1xuXHQgKiBgdW5kZWZpbmVkYCBpZiBubyBtYXRjaGluZyBzbG90IGV4aXN0cyBpbiB0aGUgZ3JpZC5cblx0ICovXG5cdGdldFNlc3Npb25WaWV3KHNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogU2Vzc2lvblZpZXcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zbG90cy5maW5kKHMgPT4gcy5ib3VuZFNlc3Npb25JZCA9PT0gc2Vzc2lvbklkKT8udmlldztcblx0fVxuXG5cdC8qKlxuXHQgKiBNb3ZlcyBrZXlib2FyZCBmb2N1cyBpbnRvIHRoZSBzZXNzaW9uIHZpZXcgaG9zdGluZyB0aGUgZ2l2ZW4gc2Vzc2lvbiBpZCAob3Jcblx0ICogdGhlIHBsYWNlaG9sZGVyIHZpZXcgd2hlbiBgc2Vzc2lvbklkYCBpcyBgdW5kZWZpbmVkYCksIGZpcnN0IHJldmVhbGluZyBpdCBpblxuXHQgKiB0aGUgZ3JpZCB3aGVuIGl0IGlzIG9ubHkgcGFydGlhbGx5IHZpc2libGUuIE5vLW9wIGlmIG5vIG1hdGNoaW5nIHNsb3QgZXhpc3RzLlxuXHQgKi9cblx0Zm9jdXNTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2xvdCA9IHRoaXMuX3Nsb3RzLmZpbmQocyA9PiBzLmJvdW5kU2Vzc2lvbklkID09PSBzZXNzaW9uSWQpO1xuXHRcdGlmICghc2xvdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZXZlYWxWaWV3KHNsb3Qudmlldyk7XG5cdFx0c2xvdC52aWV3LmZvY3VzKCk7XG5cdH1cblxuXHQvKipcblx0ICogRW5zdXJlcyB0aGUgZ2l2ZW4gdmlldyBpcyBmdWxseSB2aXNpYmxlIHdpdGhpbiB0aGUgZ3JpZC4gVGhlIGdyaWQgY2xpcHMgaXRzXG5cdCAqIGxlYXZlcyAoYG92ZXJmbG93OiBoaWRkZW5gKSBhbmQgbGF5cyB0aGVtIG91dCBzaWRlIGJ5IHNpZGU7IHdoZW4gdGhlcmUgYXJlXG5cdCAqIG1vcmUgc2Vzc2lvbnMgdGhhbiBmaXQsIHRoZSBncmlkJ3Mgc3BsaXQgdmlldyBvdmVyZmxvd3MgaG9yaXpvbnRhbGx5IGFuZFxuXHQgKiBiZWNvbWVzIHNjcm9sbGFibGUsIGxlYXZpbmcgdmlld3MgbmVhciB0aGUgZWRnZXMgcGFydGlhbGx5IGhpZGRlbi4gV2hlbiB0aGVcblx0ICogdGFyZ2V0IHZpZXcgaXMgbm90IGZ1bGx5IHZpc2libGUsIHNjcm9sbCBpdCBpbnRvIHZpZXcuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXZlYWxWaWV3KHZpZXc6IFNlc3Npb25WaWV3KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9ncmlkV2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRhaW5lclJlY3QgPSB0aGlzLl9ncmlkV2lkZ2V0LmVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3Qgdmlld1JlY3QgPSB2aWV3LmVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3QgaXNGdWxseVZpc2libGUgPSB2aWV3UmVjdC5sZWZ0ID49IGNvbnRhaW5lclJlY3QubGVmdCAtIDEgJiYgdmlld1JlY3QucmlnaHQgPD0gY29udGFpbmVyUmVjdC5yaWdodCArIDE7XG5cdFx0aWYgKCFpc0Z1bGx5VmlzaWJsZSkge1xuXHRcdFx0dmlldy5lbGVtZW50LnNjcm9sbEludG9WaWV3KHsgYmxvY2s6ICduZWFyZXN0JywgaW5saW5lOiAnbmVhcmVzdCcgfSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHByb2dyZXNzIGluZGljYXRvciBmb3IgdGhlIHBhcnQuIERyaXZlcyB0aGUgcHJvZ3Jlc3MgYmFyIHNob3duXG5cdCAqIGF0IHRoZSB0b3Agb2YgdGhlIGNvbnRlbnQgYXJlYS4gSW5kaWNhdG9yIHN0YXRlIGlzIHNjb3BlZCB0byB0aGUgcGFydCdzXG5cdCAqIHZpc2liaWxpdHksIG1pcnJvcmluZyBob3cgdmlldyBwYW5lcyBtYW5hZ2UgdGhlaXIgb3duIHByb2dyZXNzIGluZGljYXRvcnMuXG5cdCAqL1xuXHRnZXRQcm9ncmVzc0luZGljYXRvcigpOiBJUHJvZ3Jlc3NJbmRpY2F0b3Ige1xuXHRcdGlmICghdGhpcy5fcHJvZ3Jlc3NJbmRpY2F0b3IpIHtcblx0XHRcdGNvbnN0IHByb2dyZXNzQmFyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5fcHJvZ3Jlc3NCYXIpO1xuXHRcdFx0Y29uc3Qgc2NvcGVJZCA9IFBhcnRzLlNFU1NJT05TX1BBUlQ7XG5cdFx0XHRjb25zdCBpc1Zpc2libGUgPSB0aGlzLmxheW91dFNlcnZpY2UuaXNWaXNpYmxlKHNjb3BlSWQpO1xuXHRcdFx0Y29uc3Qgb25EaWRWaXNpYmlsaXR5Q2hhbmdlID0gdGhpcy5vbkRpZFZpc2liaWxpdHlDaGFuZ2U7XG5cdFx0XHRjb25zdCBzY29wZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBjbGFzcyBleHRlbmRzIEFic3RyYWN0UHJvZ3Jlc3NTY29wZSB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHNjb3BlSWQsIGlzVmlzaWJsZSk7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRWaXNpYmlsaXR5Q2hhbmdlKHZpc2libGUgPT4gdmlzaWJsZSA/IHRoaXMub25TY29wZU9wZW5lZChzY29wZUlkKSA6IHRoaXMub25TY29wZUNsb3NlZChzY29wZUlkKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KCkpO1xuXHRcdFx0dGhpcy5fcHJvZ3Jlc3NJbmRpY2F0b3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgU2NvcGVkUHJvZ3Jlc3NJbmRpY2F0b3IocHJvZ3Jlc3NCYXIsIHNjb3BlKSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm9ncmVzc0luZGljYXRvcjtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVNsb3QoKTogSUdyaWRTbG90IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCB2aWV3ID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvblZpZXcpKTtcblx0XHR2aWV3LnNldFBhcnRWaXNpYmxlKHRoaXMuX2lzUGFydFZpc2libGUpO1xuXHRcdGNvbnN0IHNsb3Q6IElHcmlkU2xvdCA9IHsgdmlldywgZGlzcG9zYWJsZXMsIGJvdW5kU2Vzc2lvbklkOiB1bmRlZmluZWQgfTtcblx0XHQvLyBQcm9tb3RlIGEgdmlzaWJsZSBzZXNzaW9uIHRvIHRoZSBhY3RpdmUgc2Vzc2lvbiB3aGVuIGl0cyB2aWV3IHJlY2VpdmVzXG5cdFx0Ly8gZm9jdXMgb3IgaXMgY2xpY2tlZC4gUG9pbnRlci1kb3duIGNvdmVycyBjbGlja3Mgb24gbm9uLWZvY3VzYWJsZSBjaHJvbWVcblx0XHQvLyAoZS5nLiB0aGUgbmV3IGNoYXQgd2lkZ2V0J3Mgd29ya3NwYWNlIHBpY2tlciBhcmVhKSB3aGVyZSBmb2N1cyB3b3VsZFxuXHRcdC8vIG5vdCBvdGhlcndpc2UgbW92ZSBpbnRvIHRoZSB2aWV3LiBUaGUgcGxhY2Vob2xkZXIgc2xvdCAobm8gYm91bmRcblx0XHQvLyBzZXNzaW9uKSBoYXMgbm90aGluZyB0byBhY3RpdmF0ZS5cblx0XHRjb25zdCBmaXJlRm9jdXMgPSAoKSA9PiB7XG5cdFx0XHRpZiAoc2xvdC5ib3VuZFNlc3Npb25JZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkRm9jdXNTZXNzaW9uLmZpcmUoc2xvdC5ib3VuZFNlc3Npb25JZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHZpZXcuZWxlbWVudCwgRXZlbnRUeXBlLkZPQ1VTX0lOLCBmaXJlRm9jdXMsIHRydWUpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lcih2aWV3LmVsZW1lbnQsIGZpcmVGb2N1cywgdHJ1ZSkpO1xuXHRcdHJldHVybiBzbG90O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2dyaWRTZXBhcmF0b3JCb3JkZXIoKTogQ29sb3Ige1xuXHRcdHJldHVybiB0aGlzLnRoZW1lLmdldENvbG9yKGFnZW50c1BhbmVsQm9yZGVyKSB8fCB0aGlzLnRoZW1lLmdldENvbG9yKGNvbnRyYXN0Qm9yZGVyKSB8fCBDb2xvci50cmFuc3BhcmVudDtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVTdHlsZXMoKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuZ2V0Q29udGFpbmVyKCkpO1xuXG5cdFx0YXBwbHlBZ2VudHNQYXJ0Q2FyZFN0eWxlcyhjb250YWluZXIsIHRoaXMudGhlbWUpO1xuXG5cdFx0dGhpcy5fZ3JpZFdpZGdldD8uc3R5bGUoeyBzZXBhcmF0b3JCb3JkZXI6IHRoaXMuX2dyaWRTZXBhcmF0b3JCb3JkZXIgfSk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNQYXJ0VmlzaWJsZSAhPT0gdmlzaWJsZSkge1xuXHRcdFx0Ly8gVXBkYXRlIGJlZm9yZSBgc3VwZXJgLCB3aG9zZSBldmVudCByZS1lbnRlcnMgdGhpcyBtZXRob2QuXG5cdFx0XHR0aGlzLl9pc1BhcnRWaXNpYmxlID0gdmlzaWJsZTtcblx0XHRcdGZvciAoY29uc3Qgc2xvdCBvZiB0aGlzLl9zbG90cykge1xuXHRcdFx0XHRzbG90LnZpZXcuc2V0UGFydFZpc2libGUodmlzaWJsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c3VwZXIuc2V0VmlzaWJsZSh2aXNpYmxlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGxheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGxlZnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5TRVNTSU9OU19QQVJUKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xhc3RMYXlvdXQgPSB7IHdpZHRoLCBoZWlnaHQsIHRvcCwgbGVmdCB9O1xuXG5cdFx0Y29uc3QgY2FyZFNpemUgPSBnZXRBZ2VudHNQYXJ0Q2FyZENvbnRlbnRTaXplKHdpZHRoLCBoZWlnaHQsIHRoaXMuYWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLmlzRWRpdG9yUGFuZVZpc2libGUoKSk7XG5cblx0XHQvLyBTaXplIHRoZSBjb250ZW50IGFyZWEgd2l0aCB0aGUgcmVkdWNlZCBkaW1lbnNpb25zLlxuXHRcdGNvbnN0IHsgY29udGVudFNpemUgfSA9IHRoaXMubGF5b3V0Q29udGVudHMoY2FyZFNpemUud2lkdGgsIGNhcmRTaXplLmhlaWdodCk7XG5cblx0XHQvLyBMYXlvdXQgdGhlIGludGVybmFsIGdyaWQgd2lkZ2V0IHdpdGhpbiB0aGUgY29udGVudCBhcmVhLlxuXHRcdHRoaXMuX2dyaWRXaWRnZXQ/LmxheW91dChjb250ZW50U2l6ZS53aWR0aCwgY29udGVudFNpemUuaGVpZ2h0LCB0b3AsIGxlZnQpO1xuXG5cdFx0Ly8gU3RvcmUgdGhlIGZ1bGwgZ3JpZC1hbGxvY2F0ZWQgZGltZW5zaW9ucyBzbyB0aGF0IFBhcnQucmVsYXlvdXQoKSB3b3JrcyBjb3JyZWN0bHkuXG5cdFx0c3VwZXIubGF5b3V0KHdpZHRoLCBoZWlnaHQsIHRvcCwgbGVmdCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc2xvdCBvZiB0aGlzLl9zbG90cykge1xuXHRcdFx0c2xvdC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Nsb3RzLmxlbmd0aCA9IDA7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0dG9KU09OKCk6IG9iamVjdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6IFBhcnRzLlNFU1NJT05TX1BBUlRcblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBVyxrQkFBa0IsY0FBYztBQUNwRCxTQUFTLFlBQVk7QUFDckIsU0FBUyx1QkFBdUIsZ0NBQWdDLDRCQUE0QjtBQUM1RixTQUFTLEdBQUcsdUNBQXVDLHVCQUF1QixXQUFXLFlBQVksa0JBQWtCO0FBRW5ILFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQW9DO0FBQzdDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXFEO0FBQzlELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsdUJBQXVCLCtCQUErQjtBQUMvRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLDJCQUEyQixvQ0FBb0M7QUFTeEUsTUFBTSx1Q0FBdUM7QUFTdEMsSUFBTSxlQUFOLGNBQTJCLEtBQUs7QUFBQSxFQTBEdEMsWUFDZ0IsY0FDRSxnQkFDOEIsNkJBQzNCLG1CQUNvQixzQkFDTSxtQkFDN0M7QUFDRDtBQUFBLE1BQ0MsTUFBTTtBQUFBLE1BQ04sRUFBRSxVQUFVLE9BQU8sYUFBYSxNQUFNLEVBQUU7QUFBQSxNQUN4QztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQVgrQztBQUVQO0FBQ007QUE5RC9DLFNBQWtCLGVBQXVCO0FBQ3pDLFNBQWtCLGVBQXVCLE9BQU87QUFDaEQsU0FBa0IsZ0JBQXdCO0FBQzFDLFNBQWtCLGdCQUF3QixPQUFPO0FBcUJqRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIsU0FBc0IsQ0FBQztBQUV4QyxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBZ0IsQ0FBQztBQUUxRTtBQUFBLFNBQVMsb0JBQW1DLEtBQUssbUJBQW1CO0FBV3BFO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBUSxpQkFBaUI7QUFTekI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixxQ0FBcUMsZ0JBQXlCLE1BQU0sS0FBSztBQU0xRixTQUFTLFdBQVcsZUFBZTtBQW1CbEMsMEJBQXNCLE9BQU8saUJBQWlCO0FBQzlDLFNBQUssb0JBQW9CLHFCQUFxQixPQUFPLGlCQUFpQjtBQUN0RSxTQUFLLDhCQUE4QiwrQkFBK0IsT0FBTyxpQkFBaUI7QUFBQSxFQUMzRjtBQUFBLEVBeEVBLElBQUksT0FBZ0I7QUFBRSxXQUFPO0FBQUEsRUFBTztBQUFBLEVBOENwQyxJQUFJLGtCQUFzQztBQUN6QyxXQUFPLEtBQUssY0FBYyx1QkFBdUIsU0FBUztBQUFBLEVBQzNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFnQ1EsZ0JBQTZCO0FBQ3BDLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUdsQyxVQUFNLCtCQUErQixZQUFZO0FBQ2hELFlBQU0sUUFBUSxNQUFNLEtBQUssa0JBQWtCLGFBQXNCLG9DQUFvQztBQUNyRyxXQUFLLG1DQUFtQyxJQUFJLFVBQVUsTUFBTSxNQUFTO0FBQUEsSUFDdEU7QUFDQSxVQUFNLElBQUksS0FBSyxrQkFBa0Isd0JBQXdCLE1BQU0sNkJBQTZCLENBQUMsQ0FBQztBQUM5RixpQ0FBNkI7QUFFN0IsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVTLE9BQU8sUUFBMkI7QUFDMUMsU0FBSyxVQUFVO0FBQ2YsV0FBTyxVQUFVLElBQUksY0FBYztBQVFuQyxTQUFLLFVBQVUsS0FBSyxjQUFjLENBQUM7QUFFbkMsVUFBTSxPQUFPLE1BQU07QUFBQSxFQUNwQjtBQUFBLEVBRW1CLGtCQUFrQixRQUFrQztBQUN0RSxVQUFNLGNBQWMsRUFBRSxVQUFVO0FBQ2hDLFdBQU8sWUFBWSxXQUFXO0FBSTlCLFVBQU0sZUFBZSxLQUFLLFVBQVUsV0FBVyxXQUFXLENBQUM7QUFDM0QsU0FBSyxVQUFVLGFBQWEsV0FBVyxNQUFNLEtBQUssa0JBQWtCLElBQUksSUFBSSxDQUFDLENBQUM7QUFDOUUsU0FBSyxVQUFVLGFBQWEsVUFBVSxNQUFNLEtBQUssa0JBQWtCLElBQUksS0FBSyxDQUFDLENBQUM7QUFJOUUsU0FBSyxlQUFlLEtBQUssVUFBVSxJQUFJLFlBQVksYUFBYSx3QkFBd0IsQ0FBQztBQUN6RixTQUFLLGFBQWEsS0FBSztBQUl2QixVQUFNLGNBQWMsS0FBSyxZQUFZO0FBQ3JDLFNBQUssY0FBYyxLQUFLLFVBQVUsSUFBSSxpQkFBaUIsWUFBWSxNQUFNLEVBQUUsUUFBUSxFQUFFLGlCQUFpQixLQUFLLHFCQUFxQixFQUFFLENBQUMsQ0FBQztBQUNwSSxTQUFLLE9BQU8sS0FBSyxXQUFXO0FBQzVCLGdCQUFZLFlBQVksS0FBSyxZQUFZLE9BQU87QUFJaEQsU0FBSyxVQUFVLEtBQUssWUFBWSx5QkFBeUIsTUFBTSxLQUFLLHNCQUFzQixDQUFDLENBQUM7QUFHNUYsVUFBTSxlQUEyQztBQUFBLE1BQ2hELGdCQUFnQixDQUFDLFVBQXVCLEtBQUssZ0JBQWdCLEtBQUs7QUFBQSxJQUNuRTtBQUNBLFNBQUssVUFBVSxLQUFLLHFCQUFxQixlQUFlLG1CQUFtQixhQUFhLFlBQVksQ0FBQztBQUVyRyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZ0JBQWdCLE9BQStGO0FBQ3RILGVBQVcsUUFBUSxLQUFLLFFBQVE7QUFDL0IsVUFBSSxLQUFLLG1CQUFtQixRQUFXO0FBQ3RDO0FBQUEsTUFDRDtBQUNBLFVBQUksV0FBVyxPQUFPLEtBQUssS0FBSyxPQUFPLEdBQUc7QUFDekMsZUFBTyxFQUFFLFdBQVcsS0FBSyxnQkFBZ0IsU0FBUyxLQUFLLEtBQUssUUFBUTtBQUFBLE1BQ3JFO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRQSxzQkFBc0IsU0FBa0QsUUFBMEM7QUFDakgsUUFBSSxDQUFDLEtBQUssYUFBYTtBQUN0QjtBQUFBLElBQ0Q7QUFHQSxVQUFNLGVBQWUsS0FBSyxJQUFJLFFBQVEsUUFBUSxDQUFDO0FBRy9DLFdBQU8sS0FBSyxPQUFPLFNBQVMsY0FBYztBQUN6QyxZQUFNLE9BQU8sS0FBSyxZQUFZO0FBQzlCLFlBQU0sWUFBWSxLQUFLLE9BQU8sS0FBSyxPQUFPLFNBQVMsQ0FBQyxFQUFFO0FBQ3RELFdBQUssWUFBWSxRQUFRLEtBQUssTUFBTSxPQUFPLFlBQVksV0FBVyxVQUFVLEtBQUs7QUFDakYsV0FBSyxPQUFPLEtBQUssSUFBSTtBQUFBLElBQ3RCO0FBR0EsV0FBTyxLQUFLLE9BQU8sU0FBUyxjQUFjO0FBQ3pDLFlBQU0sT0FBTyxLQUFLLE9BQU8sSUFBSTtBQUM3QixXQUFLLFlBQVksV0FBVyxLQUFLLE1BQU0sT0FBTyxVQUFVO0FBQ3hELFdBQUssWUFBWSxRQUFRO0FBQUEsSUFDMUI7QUFHQSxhQUFTLElBQUksR0FBRyxJQUFJLEtBQUssT0FBTyxRQUFRLEtBQUs7QUFDNUMsWUFBTSxPQUFPLEtBQUssT0FBTyxDQUFDO0FBQzFCLFlBQU0sVUFBVSxRQUFRLENBQUM7QUFDekIsV0FBSyxpQkFBaUIsU0FBUztBQUMvQixXQUFLLEtBQUssWUFBWSxTQUFTLEVBQUUsbUNBQW1DLEtBQUssbUNBQW1DLENBQUM7QUFBQSxJQUM5RztBQUdBLFVBQU0sV0FBVyxRQUFRO0FBQ3pCLGVBQVcsUUFBUSxLQUFLLFFBQVE7QUFDL0IsWUFBTSxXQUFZLEtBQUssbUJBQW1CLFVBQWEsS0FBSyxtQkFBbUIsWUFBYSxLQUFLLE9BQU8sV0FBVztBQUNuSCxXQUFLLEtBQUssUUFBUSxVQUFVLE9BQU8sYUFBYSxRQUFRO0FBQ3hELFdBQUssS0FBSyxVQUFVLFFBQVE7QUFBQSxJQUM3QjtBQUtBLFFBQUksS0FBSyxZQUFZLGlCQUFpQixHQUFHO0FBQ3hDLFlBQU0sZ0JBQWdCLEtBQUssT0FBTyxLQUFLLE9BQUssS0FBSyxZQUFhLGdCQUFnQixFQUFFLElBQUksQ0FBQztBQUNyRixVQUFJLGlCQUFpQixjQUFjLG1CQUFtQixVQUFVO0FBQy9ELGFBQUssWUFBWSxrQkFBa0I7QUFBQSxNQUNwQztBQUFBLElBQ0Q7QUFFQSxTQUFLLG1CQUFtQixPQUFPO0FBQUEsRUFDaEM7QUFBQSxFQUVRLG1CQUFtQixTQUF3RDtBQUNsRixTQUFLLDRCQUE0QixJQUFJLFFBQVEsU0FBUyxDQUFDO0FBQUEsRUFDeEQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSx3QkFBOEI7QUFDckMsUUFBSSxDQUFDLEtBQUssYUFBYTtBQUN0QjtBQUFBLElBQ0Q7QUFDQSxlQUFXLFFBQVEsS0FBSyxRQUFRO0FBQy9CLFdBQUssS0FBSyxhQUFhLEtBQUssWUFBWSxnQkFBZ0IsS0FBSyxJQUFJLENBQUM7QUFBQSxJQUNuRTtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFVQSxzQkFBc0IsV0FBb0Q7QUFDekUsUUFBSSxDQUFDLEtBQUssYUFBYTtBQUN0QixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sT0FBTyxLQUFLLE9BQU8sS0FBSyxPQUFLLEVBQUUsbUJBQW1CLFNBQVM7QUFDakUsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksS0FBSyxZQUFZLGdCQUFnQixLQUFLLElBQUksR0FBRztBQUNoRCxXQUFLLFlBQVksa0JBQWtCO0FBQ25DLGFBQU87QUFBQSxJQUNSLFdBQVcsS0FBSyxPQUFPLE9BQU8sT0FBSyxFQUFFLG1CQUFtQixNQUFTLEVBQUUsVUFBVSxHQUFHO0FBQy9FLFdBQUssWUFBWSxhQUFhLEtBQUssSUFBSTtBQUN2QyxXQUFLLEtBQUssTUFBTTtBQUNoQixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT0EsZUFBZSxXQUF3RDtBQUN0RSxXQUFPLEtBQUssT0FBTyxLQUFLLE9BQUssRUFBRSxtQkFBbUIsU0FBUyxHQUFHO0FBQUEsRUFDL0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSxhQUFhLFdBQXFDO0FBQ2pELFVBQU0sT0FBTyxLQUFLLE9BQU8sS0FBSyxPQUFLLEVBQUUsbUJBQW1CLFNBQVM7QUFDakUsUUFBSSxDQUFDLE1BQU07QUFDVjtBQUFBLElBQ0Q7QUFDQSxTQUFLLFlBQVksS0FBSyxJQUFJO0FBQzFCLFNBQUssS0FBSyxNQUFNO0FBQUEsRUFDakI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU1EsWUFBWSxNQUF5QjtBQUM1QyxRQUFJLENBQUMsS0FBSyxhQUFhO0FBQ3RCO0FBQUEsSUFDRDtBQUNBLFVBQU0sZ0JBQWdCLEtBQUssWUFBWSxRQUFRLHNCQUFzQjtBQUNyRSxVQUFNLFdBQVcsS0FBSyxRQUFRLHNCQUFzQjtBQUNwRCxVQUFNLGlCQUFpQixTQUFTLFFBQVEsY0FBYyxPQUFPLEtBQUssU0FBUyxTQUFTLGNBQWMsUUFBUTtBQUMxRyxRQUFJLENBQUMsZ0JBQWdCO0FBQ3BCLFdBQUssUUFBUSxlQUFlLEVBQUUsT0FBTyxXQUFXLFFBQVEsVUFBVSxDQUFDO0FBQUEsSUFDcEU7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT0EsdUJBQTJDO0FBQzFDLFFBQUksQ0FBQyxLQUFLLG9CQUFvQjtBQUM3QixZQUFNLGNBQWMscUJBQXFCLEtBQUssWUFBWTtBQUMxRCxZQUFNLFVBQVUsTUFBTTtBQUN0QixZQUFNLFlBQVksS0FBSyxjQUFjLFVBQVUsT0FBTztBQUN0RCxZQUFNLHdCQUF3QixLQUFLO0FBQ25DLFlBQU0sUUFBUSxLQUFLLFVBQVUsSUFBSSxjQUFjLHNCQUFzQjtBQUFBLFFBQ3BFLGNBQWM7QUFDYixnQkFBTSxTQUFTLFNBQVM7QUFDeEIsZUFBSyxVQUFVLHNCQUFzQixhQUFXLFVBQVUsS0FBSyxjQUFjLE9BQU8sSUFBSSxLQUFLLGNBQWMsT0FBTyxDQUFDLENBQUM7QUFBQSxRQUNySDtBQUFBLE1BQ0QsRUFBRSxDQUFDO0FBQ0gsV0FBSyxxQkFBcUIsS0FBSyxVQUFVLElBQUksd0JBQXdCLGFBQWEsS0FBSyxDQUFDO0FBQUEsSUFDekY7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFUSxjQUF5QjtBQUNoQyxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsVUFBTSxPQUFPLFlBQVksSUFBSSxLQUFLLHFCQUFxQixlQUFlLFdBQVcsQ0FBQztBQUNsRixTQUFLLGVBQWUsS0FBSyxjQUFjO0FBQ3ZDLFVBQU0sT0FBa0IsRUFBRSxNQUFNLGFBQWEsZ0JBQWdCLE9BQVU7QUFNdkUsVUFBTSxZQUFZLE1BQU07QUFDdkIsVUFBSSxLQUFLLG1CQUFtQixRQUFXO0FBQ3RDLGFBQUssbUJBQW1CLEtBQUssS0FBSyxjQUFjO0FBQUEsTUFDakQ7QUFBQSxJQUNEO0FBQ0EsZ0JBQVksSUFBSSxzQkFBc0IsS0FBSyxTQUFTLFVBQVUsVUFBVSxXQUFXLElBQUksQ0FBQztBQUN4RixnQkFBWSxJQUFJLHNDQUFzQyxLQUFLLFNBQVMsV0FBVyxJQUFJLENBQUM7QUFDcEYsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLElBQVksdUJBQThCO0FBQ3pDLFdBQU8sS0FBSyxNQUFNLFNBQVMsaUJBQWlCLEtBQUssS0FBSyxNQUFNLFNBQVMsY0FBYyxLQUFLLE1BQU07QUFBQSxFQUMvRjtBQUFBLEVBRVMsZUFBcUI7QUFDN0IsVUFBTSxhQUFhO0FBRW5CLFVBQU0sWUFBWSxxQkFBcUIsS0FBSyxhQUFhLENBQUM7QUFFMUQsOEJBQTBCLFdBQVcsS0FBSyxLQUFLO0FBRS9DLFNBQUssYUFBYSxNQUFNLEVBQUUsaUJBQWlCLEtBQUsscUJBQXFCLENBQUM7QUFBQSxFQUN2RTtBQUFBLEVBRVMsV0FBVyxTQUF3QjtBQUMzQyxRQUFJLEtBQUssbUJBQW1CLFNBQVM7QUFFcEMsV0FBSyxpQkFBaUI7QUFDdEIsaUJBQVcsUUFBUSxLQUFLLFFBQVE7QUFDL0IsYUFBSyxLQUFLLGVBQWUsT0FBTztBQUFBLE1BQ2pDO0FBQUEsSUFDRDtBQUVBLFVBQU0sV0FBVyxPQUFPO0FBQUEsRUFDekI7QUFBQSxFQUVTLE9BQU8sT0FBZSxRQUFnQixLQUFhLE1BQW9CO0FBQy9FLFFBQUksQ0FBQyxLQUFLLGNBQWMsVUFBVSxNQUFNLGFBQWEsR0FBRztBQUN2RDtBQUFBLElBQ0Q7QUFFQSxTQUFLLGNBQWMsRUFBRSxPQUFPLFFBQVEsS0FBSyxLQUFLO0FBRTlDLFVBQU0sV0FBVyw2QkFBNkIsT0FBTyxRQUFRLEtBQUssNEJBQTRCLG9CQUFvQixDQUFDO0FBR25ILFVBQU0sRUFBRSxZQUFZLElBQUksS0FBSyxlQUFlLFNBQVMsT0FBTyxTQUFTLE1BQU07QUFHM0UsU0FBSyxhQUFhLE9BQU8sWUFBWSxPQUFPLFlBQVksUUFBUSxLQUFLLElBQUk7QUFHekUsVUFBTSxPQUFPLE9BQU8sUUFBUSxLQUFLLElBQUk7QUFBQSxFQUN0QztBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsZUFBVyxRQUFRLEtBQUssUUFBUTtBQUMvQixXQUFLLFlBQVksUUFBUTtBQUFBLElBQzFCO0FBQ0EsU0FBSyxPQUFPLFNBQVM7QUFDckIsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUFBLEVBRUEsU0FBaUI7QUFDaEIsV0FBTztBQUFBLE1BQ04sTUFBTSxNQUFNO0FBQUEsSUFDYjtBQUFBLEVBQ0Q7QUFDRDtBQUFBO0FBdlphLGFBU0ksZUFBZTtBQVRuQixlQUFOO0FBQUEsRUEyREo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBaEVVOyIsCiAgIm5hbWVzIjogW10KfQo=
