import { mainWindow } from "../../../../base/browser/window.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableFromEvent } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import product from "../../../../platform/product/common/product.js";
import { StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ViewContainerLocation } from "../../../../workbench/common/views.js";
import { Parts } from "../../../../workbench/services/layout/browser/layoutService.js";
import { sessionHasChanges } from "../../../services/sessions/common/session.js";
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID } from "../../changes/common/changes.js";
import { SESSIONS_FILES_CONTAINER_ID } from "../../files/browser/files.contribution.js";
import { BaseLayoutController } from "./baseSessionLayoutController.js";
const NEW_SESSION_VIEW_STATE_KEY = "sessions.newSessionViewState";
const SMALL_WINDOW_MAX_WIDTH = 1800;
const RESPONSIVE_SIDEBAR_SETTING = "sessions.layout.autoCollapseSessionsSidebar";
class LayoutController extends BaseLayoutController {
  constructor() {
    super(...arguments);
    /** [D7] `true` while the sidebar is hidden because the controller auto-hid it; only such hides are auto-reverted. */
    this._sidebarAutoHidden = false;
    /** [D7] Guards the manual-toggle listener while the controller itself toggles the sidebar. */
    this._applyingAutoSidebar = false;
    /** [D7] Last computed space-constrained state, so the autorun only acts on real transitions. */
    this._previousSpaceConstrained = false;
    /** [D2/D8] `true` while the controller hides the side pane to restore a session's remembered state, so the hide isn't captured as a user choice. */
    this._hidingAuxiliaryBarForRestore = false;
  }
  _registerViewStateManagement() {
    this._loadNewSessionViewState();
    const activeSessionIsCreatedObs = derived((reader) => {
      const activeSession = this._sessionsService.activeSession.read(reader);
      return activeSession?.isCreated.read(reader) ?? false;
    });
    const activeSessionHasWorkspaceObs = derived((reader) => {
      const activeSession = this._sessionsService.activeSession.read(reader);
      return activeSession?.workspace.read(reader)?.folders?.[0]?.root !== void 0;
    });
    const editorMaximizedObs = observableFromEvent(
      this,
      this._layoutService.onDidChangeEditorMaximized,
      () => this._layoutService.isEditorMaximized()
    );
    let previousSessionResource;
    let previousIsCreated = false;
    this._register(autorun((reader) => {
      const editorMaximized = editorMaximizedObs.read(reader);
      const activeSessionResource = this.activeSessionResourceObs.read(reader);
      const isCreated = activeSessionIsCreatedObs.read(reader);
      if (editorMaximized) {
        previousSessionResource = activeSessionResource;
        previousIsCreated = isCreated;
        void this._viewsService.openView(CHANGES_VIEW_ID, false);
        return;
      }
      const activeSessionHasWorkspace = activeSessionHasWorkspaceObs.read(reader);
      const multipleVisible = this.multipleSessionsVisibleObs.read(reader);
      if (multipleVisible) {
        previousSessionResource = activeSessionResource;
        previousIsCreated = isCreated;
        return;
      }
      const isSessionSwitch = previousSessionResource !== void 0 && !isEqual(previousSessionResource, activeSessionResource);
      if (isSessionSwitch) {
        this._captureViewState(previousSessionResource);
      }
      const isSubmit = previousSessionResource !== void 0 && !isSessionSwitch && !previousIsCreated && isCreated && activeSessionResource !== void 0;
      previousSessionResource = activeSessionResource;
      previousIsCreated = isCreated;
      if (isSubmit) {
        this._withSessionLayoutRestore(() => this._onNewSessionSubmitted(activeSessionResource));
        return;
      }
      this._withSessionLayoutRestore(
        () => this._syncAuxiliaryBarVisibility(activeSessionResource, activeSessionHasWorkspace, isCreated)
      );
    }));
    this._register(this._layoutService.onDidChangePartVisibility((e) => {
      if (e.partId !== Parts.AUXILIARYBAR_PART) {
        return;
      }
      if (this._togglingSidePane) {
        return;
      }
      if (this._hidingAuxiliaryBarForRestore) {
        return;
      }
      if (this._isRestoringSessionLayout) {
        return;
      }
      if (this.multipleSessionsVisibleObs.get()) {
        return;
      }
      if (this._layoutService.isEditorMaximized()) {
        return;
      }
      const activeSession = this._sessionsService.activeSession.get();
      if (!activeSession) {
        return;
      }
      if (!activeSession.isCreated.get()) {
        this._setNewSessionViewState({ auxiliaryBarVisible: e.visible });
      } else {
        if (e.visible && this._restoreSavedAuxiliaryBarContainerOnReveal(activeSession.resource)) {
          return;
        }
        this._captureViewState(activeSession.resource);
      }
    }));
    this._registerChangesAutoReveal();
    this._registerResponsiveSidebar();
    this._registerAuxiliaryBarPartVisibility();
    this._registerNewSessionRules();
  }
  _registerChangesAutoReveal() {
    this._register(this._editorService.onDidActiveEditorChange(() => this._revealChangesViewOnFirstOpen()));
    this._register(this._layoutService.onDidChangePartVisibility((e) => {
      if (e.partId === Parts.EDITOR_PART && e.visible) {
        this._revealChangesViewOnFirstOpen();
      }
    }));
  }
  _registerNewSessionRules() {
  }
  _onSessionReplaced(from, to) {
    super._onSessionReplaced(from, to);
    const activeSession = this._sessionsService.activeSession.get();
    const replacedSessionIsActive = isEqual(activeSession?.resource, from.resource) || isEqual(activeSession?.resource, to.resource);
    const auxiliaryBarVisible = replacedSessionIsActive ? this._layoutService.isVisible(Parts.AUXILIARYBAR_PART) : this._newSessionViewState?.auxiliaryBarVisible;
    if (auxiliaryBarVisible === void 0) {
      return;
    }
    this._viewStateBySession.set(to.resource, {
      auxiliaryBarVisible,
      auxiliaryBarActiveViewContainerId: replacedSessionIsActive && auxiliaryBarVisible ? this._paneCompositePartService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.getId() : void 0
    });
  }
  /**
   * [D10] Keep the auxiliary-bar part hidden when it has no active view
   * containers (e.g. a workspace-less quick chat where Changes+Files are gated
   * off), so an empty column is never shown. Re-checks on container add/remove,
   * location moves, active-view-descriptor changes (the gating signal), and
   * aux-bar visibility changes. Only ever hides — reveals stay with [D3]/[D8].
   */
  _registerAuxiliaryBarPartVisibility() {
    const modelListeners = this._register(new DisposableStore());
    const rewire = () => {
      modelListeners.clear();
      for (const container of this._viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.AuxiliaryBar)) {
        modelListeners.add(this._viewDescriptorService.getViewContainerModel(container).onDidChangeActiveViewDescriptors(() => this._syncAuxiliaryBarPartVisibility()));
      }
      this._syncAuxiliaryBarPartVisibility();
    };
    this._register(this._viewDescriptorService.onDidChangeViewContainers(rewire));
    this._register(this._viewDescriptorService.onDidChangeContainerLocation(rewire));
    this._register(this._viewsService.onDidChangeViewContainerVisibility((e) => {
      if (e.location === ViewContainerLocation.AuxiliaryBar) {
        this._syncAuxiliaryBarPartVisibility();
      }
    }));
    this._register(this._layoutService.onDidChangePartVisibility((e) => {
      if (e.partId === Parts.AUXILIARYBAR_PART && e.visible) {
        this._syncAuxiliaryBarPartVisibility();
      }
    }));
    rewire();
  }
  /** [D10] Hide the aux-bar part when it has no active view containers; never reveals it. */
  _syncAuxiliaryBarPartVisibility() {
    if (this._hasActiveAuxViewContainers()) {
      return;
    }
    const activeSession = this._sessionsService.activeSession.get();
    if (activeSession?.isQuickChat?.get() !== true) {
      return;
    }
    if (this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
      const suppression = this._layoutService.suppressEditorPartAutoVisibility();
      try {
        this._hideAuxiliaryBarForRestore();
      } finally {
        suppression.dispose();
      }
    }
  }
  /**
   * [D8] When a Changes (multi-diff) editor is opened (becomes active, or its
   * editor part is re-revealed) for an existing session, show the Changes view
   * in the side pane unless the user explicitly hid the aux bar for that
   * session. This reveals it the first time (no remembered choice) and again
   * after the whole side pane was closed (D9, which keeps the remembered choice
   * "open"), but respects an explicit aux-bar-hidden choice. The reveal is
   * captured by [D2]. Skipped while a side-pane toggle is in progress (so the
   * toggle restores exactly the remembered parts, D9), while the editor is
   * maximized (D5) or while multiple sessions are visible, where the side pane
   * is managed by other rules.
   */
  _revealChangesViewOnFirstOpen() {
    if (this._togglingSidePane) {
      return;
    }
    const activeEditorResource = this._editorService.activeEditor?.resource;
    if (!activeEditorResource) {
      return;
    }
    const changesSessionResource = this._sessionChangesService.getSessionResource(activeEditorResource);
    if (!changesSessionResource) {
      return;
    }
    if (this.multipleSessionsVisibleObs.get() || this._layoutService.isEditorMaximized()) {
      return;
    }
    const activeSession = this._sessionsService.activeSession.get();
    if (!activeSession || !isEqual(activeSession.resource, changesSessionResource)) {
      return;
    }
    if (!activeSession.isCreated.get()) {
      return;
    }
    if (!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
      return;
    }
    const savedState = this._viewStateBySession.get(changesSessionResource);
    if (savedState) {
      if (this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
        return;
      }
      if (!savedState.auxiliaryBarVisible && !savedState.auxiliaryBarHiddenByCollapse) {
        return;
      }
    }
    void this._viewsService.openView(CHANGES_VIEW_ID, false);
  }
  /**
   * On a small window, auto-hide the sessions sidebar while both the editor and
   * auxiliary bar are open and auto-show it again once either closes — unless the
   * user closed the sidebar themselves. Disabled while multiple sessions are
   * visible and never triggered by session navigation. Gated by the experimental
   * `sessions.layout.autoCollapseSessionsSidebar` setting.
   */
  _registerResponsiveSidebar() {
    const enabledObs = observableConfigValue(RESPONSIVE_SIDEBAR_SETTING, product.quality !== "stable", this._configurationService);
    const smallWindowObs = observableFromEvent(
      this,
      this._layoutService.onDidLayoutMainContainer,
      () => this._layoutService.mainContainerDimension.width <= SMALL_WINDOW_MAX_WIDTH
    );
    const editorVisibleObs = observableFromEvent(
      this,
      this._layoutService.onDidChangePartVisibility,
      () => this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)
    );
    const auxiliaryBarVisibleObs = observableFromEvent(
      this,
      this._layoutService.onDidChangePartVisibility,
      () => this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)
    );
    const editorMaximizedObs = observableFromEvent(
      this,
      this._layoutService.onDidChangeEditorMaximized,
      () => this._layoutService.isEditorMaximized()
    );
    const spaceConstrainedObs = derived((reader) => enabledObs.read(reader) && !this.multipleSessionsVisibleObs.read(reader) && smallWindowObs.read(reader) && editorVisibleObs.read(reader) && auxiliaryBarVisibleObs.read(reader));
    this._previousSpaceConstrained = spaceConstrainedObs.get();
    this._register(autorun((reader) => {
      if (editorMaximizedObs.read(reader)) {
        return;
      }
      const constrained = spaceConstrainedObs.read(reader);
      if (this._isRestoringSessionLayout) {
        this._previousSpaceConstrained = constrained;
        return;
      }
      if (constrained === this._previousSpaceConstrained) {
        return;
      }
      this._previousSpaceConstrained = constrained;
      if (constrained) {
        if (this._setSidebarAutoHidden(true)) {
          this._sidebarAutoHidden = true;
        }
      } else if (this._sidebarAutoHidden) {
        this._setSidebarAutoHidden(false);
        this._sidebarAutoHidden = false;
      }
    }));
    this._register(this._layoutService.onDidChangePartVisibility((e) => {
      if (e.partId !== Parts.SIDEBAR_PART || this._applyingAutoSidebar) {
        return;
      }
      this._sidebarAutoHidden = false;
    }));
  }
  /** Returns `true` when the sidebar visibility was actually changed. */
  _setSidebarAutoHidden(hidden) {
    if (this._layoutService.isVisible(Parts.SIDEBAR_PART) === !hidden) {
      return false;
    }
    this._applyingAutoSidebar = true;
    try {
      this._layoutService.setPartHidden(hidden, Parts.SIDEBAR_PART);
    } finally {
      this._applyingAutoSidebar = false;
    }
    return true;
  }
  // [B4] Snapshot the active session's aux-bar state when persisting.
  _captureActiveSessionViewState(sessionResource) {
    this._captureViewState(sessionResource);
  }
  /**
   * [D9b] Records a whole-side-pane toggle for the active session. For an
   * uncreated session it updates the shared new-session choice. For a created
   * session, only a full collapse of a previously-visible aux bar is marked as a
   * collapse-driven hide (so opening Changes later re-reveals it); any other
   * outcome just captures the resulting state, preserving an explicit aux-bar
   * hide. See `desktopSessionLayoutController.md`.
   */
  _onSidePaneToggled(collapsed, previousAuxiliaryBarVisible) {
    if (this.multipleSessionsVisibleObs.get()) {
      return;
    }
    if (this._layoutService.isEditorMaximized()) {
      return;
    }
    const activeSession = this._sessionsService.activeSession.get();
    if (!activeSession) {
      return;
    }
    if (!activeSession.isCreated.get()) {
      this._setNewSessionViewState({ auxiliaryBarVisible: this._layoutService.isVisible(Parts.AUXILIARYBAR_PART) });
      return;
    }
    if (collapsed && previousAuxiliaryBarVisible) {
      const activeViewContainerId = this._paneCompositePartService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.getId();
      this._viewStateBySession.set(activeSession.resource, {
        auxiliaryBarVisible: false,
        auxiliaryBarActiveViewContainerId: activeViewContainerId,
        auxiliaryBarHiddenByCollapse: true
      });
      return;
    }
    this._captureViewState(activeSession.resource);
  }
  // --- Auxiliary bar [D1] ---
  _captureViewState(sessionResource) {
    const auxiliaryBarVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
    const activeViewContainerId = this._paneCompositePartService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.getId();
    const previous = this._viewStateBySession.get(sessionResource);
    const auxiliaryBarHiddenByCollapse = !auxiliaryBarVisible && previous?.auxiliaryBarHiddenByCollapse === true;
    this._viewStateBySession.set(sessionResource, {
      auxiliaryBarVisible,
      auxiliaryBarActiveViewContainerId: activeViewContainerId,
      ...auxiliaryBarHiddenByCollapse ? { auxiliaryBarHiddenByCollapse: true } : {}
    });
  }
  _setNewSessionViewState(state) {
    this._newSessionViewState = state;
    this._storageService.store(NEW_SESSION_VIEW_STATE_KEY, JSON.stringify(state), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  /**
   * [D4] When a new (uncreated) session is submitted it becomes a real session
   * while staying active. Keep the auxiliary bar exactly as the user left it: if
   * open, keep it open on the container it is already showing; if closed, keep it
   * closed and record no container so opening the side pane later picks the
   * default for the session's change state at that time ([D3d]). The resulting
   * state is persisted so later syncs don't fall back to hidden.
   */
  _onNewSessionSubmitted(sessionResource) {
    const auxiliaryBarVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
    this._viewStateBySession.set(sessionResource, {
      auxiliaryBarVisible,
      auxiliaryBarActiveViewContainerId: auxiliaryBarVisible ? this._paneCompositePartService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.getId() : void 0
    });
  }
  // [D3] Restore the auxiliary bar in strict priority order.
  // Note: This method is intentionally synchronous (void return). View-opening calls are
  // fire-and-forget so that _isRestoringSessionLayout ends immediately after sync operations.
  // This allows D2 to capture user actions that happen after the sync restore but before
  // working-set apply, while still skipping single-pane detail-panel reveals during working-set apply.
  _syncAuxiliaryBarVisibility(sessionResource, hasWorkspace, isCreated) {
    if (!sessionResource || !hasWorkspace) {
      return;
    }
    if (!isCreated) {
      if (this._newSessionViewState && !this._newSessionViewState.auxiliaryBarVisible) {
        this._hideAuxiliaryBarForRestore();
        return;
      }
      void this._openDefaultAuxiliaryBarContainer();
      return;
    }
    const savedState = this._viewStateBySession.get(sessionResource);
    if (!savedState || !savedState.auxiliaryBarVisible) {
      this._hideAuxiliaryBarForRestore();
      return;
    }
    const savedContainerId = savedState.auxiliaryBarActiveViewContainerId;
    if (savedContainerId && this._isAuxiliaryBarContainerPinned(savedContainerId)) {
      void this._viewsService.openViewContainer(savedContainerId, false);
      return;
    }
    void this._openDefaultAuxiliaryBarContainer();
  }
  /**
   * [D3d] The container the side pane defaults to for the active session:
   * Changes once the session has produced at least one change (in any of its
   * chats), Files until then. Falls back to Changes when the user has unpinned
   * the Files pane, since there is nothing else to show.
   *
   * Read untracked on purpose: the default is evaluated at the moment the side
   * pane is opened, so a change landing later never switches a pane the user is
   * already looking at.
   */
  _defaultAuxiliaryBarContainerId() {
    if (!this._isAuxiliaryBarContainerPinned(SESSIONS_FILES_CONTAINER_ID)) {
      return CHANGES_VIEW_CONTAINER_ID;
    }
    const activeSession = this._sessionsService.activeSession.get();
    return activeSession && sessionHasChanges(activeSession, void 0) ? CHANGES_VIEW_CONTAINER_ID : SESSIONS_FILES_CONTAINER_ID;
  }
  /** [D3d] Opens the container chosen by {@link _defaultAuxiliaryBarContainerId}. */
  _openDefaultAuxiliaryBarContainer(containerId = this._defaultAuxiliaryBarContainerId()) {
    if (containerId === CHANGES_VIEW_CONTAINER_ID) {
      return this._viewsService.openView(CHANGES_VIEW_ID, false);
    }
    return this._viewsService.openViewContainer(containerId, false);
  }
  _restoreSavedAuxiliaryBarContainerOnReveal(sessionResource) {
    const savedState = this._viewStateBySession.get(sessionResource);
    if (!savedState || savedState.auxiliaryBarVisible) {
      return false;
    }
    const savedContainerId = savedState.auxiliaryBarActiveViewContainerId;
    if (savedContainerId && this._isAuxiliaryBarContainerPinned(savedContainerId)) {
      this._viewStateBySession.set(sessionResource, { ...savedState, auxiliaryBarVisible: true });
      void this._viewsService.openViewContainer(savedContainerId, false);
    } else {
      const defaultContainerId = this._defaultAuxiliaryBarContainerId();
      this._viewStateBySession.set(sessionResource, {
        auxiliaryBarVisible: true,
        auxiliaryBarActiveViewContainerId: defaultContainerId
      });
      void this._openDefaultAuxiliaryBarContainer(defaultContainerId);
    }
    return true;
  }
  /**
   * [D2/D8] Hide the side pane as part of restoring a session's remembered
   * state. The synchronous guard makes the [D2] listener ignore the resulting
   * visibility change so a restore-driven hide is never recorded as a new
   * per-session choice.
   */
  _hideAuxiliaryBarForRestore() {
    this._hidingAuxiliaryBarForRestore = true;
    try {
      this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
    } finally {
      this._hidingAuxiliaryBarForRestore = false;
    }
  }
  _isAuxiliaryBarContainerPinned(containerId) {
    return this._paneCompositePartService.getPinnedPaneCompositeIds(ViewContainerLocation.AuxiliaryBar).includes(containerId);
  }
  _loadNewSessionViewState() {
    const newSessionRaw = this._storageService.get(NEW_SESSION_VIEW_STATE_KEY, StorageScope.WORKSPACE);
    if (!newSessionRaw) {
      return;
    }
    try {
      const parsed = JSON.parse(newSessionRaw);
      if (parsed && typeof parsed.auxiliaryBarVisible === "boolean") {
        this._newSessionViewState = { auxiliaryBarVisible: parsed.auxiliaryBarVisible };
      } else {
        this._storageService.remove(NEW_SESSION_VIEW_STATE_KEY, StorageScope.WORKSPACE);
      }
    } catch {
      this._storageService.remove(NEW_SESSION_VIEW_STATE_KEY, StorageScope.WORKSPACE);
    }
  }
}
LayoutController.ID = "workbench.contrib.sessionsLayoutController";
export {
  LayoutController,
  RESPONSIVE_SIDEBAR_SETTING
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvbGF5b3V0L2Jyb3dzZXIvZGVza3RvcFNlc3Npb25MYXlvdXRDb250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb25maWdWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24sIHNlc3Npb25IYXNDaGFuZ2VzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRCwgQ0hBTkdFU19WSUVXX0lEIH0gZnJvbSAnLi4vLi4vY2hhbmdlcy9jb21tb24vY2hhbmdlcy5qcyc7XG5pbXBvcnQgeyBTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQgfSBmcm9tICcuLi8uLi9maWxlcy9icm93c2VyL2ZpbGVzLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBCYXNlTGF5b3V0Q29udHJvbGxlciB9IGZyb20gJy4vYmFzZVNlc3Npb25MYXlvdXRDb250cm9sbGVyLmpzJztcblxuLyoqXG4gKiBTaGFyZWQgbGF5b3V0IHN0YXRlIGZvciB0aGUgbmV3LXNlc3Npb24gKHVudGl0bGVkKSB2aWV3LiBVbnRpdGxlZCBzZXNzaW9uc1xuICogZWFjaCBoYXZlIGEgZGlzdGluY3QgcmVzb3VyY2UsIHNvIGEgc2luZ2xlIHZhbHVlIGNhcnJpZXMgdGhlIHVzZXIncyBjaG9pY2VzXG4gKiBhY3Jvc3MgbmV3IHNlc3Npb25zLlxuICovXG5pbnRlcmZhY2UgSU5ld1Nlc3Npb25WaWV3U3RhdGUge1xuXHRyZWFkb25seSBhdXhpbGlhcnlCYXJWaXNpYmxlOiBib29sZWFuO1xufVxuXG4vKiogU2hhcmVkIGxheW91dCBzdGF0ZSBmb3IgdGhlIG5ldy1zZXNzaW9uICh1bnRpdGxlZCkgdmlldy4gKi9cbmNvbnN0IE5FV19TRVNTSU9OX1ZJRVdfU1RBVEVfS0VZID0gJ3Nlc3Npb25zLm5ld1Nlc3Npb25WaWV3U3RhdGUnO1xuXG4vKipcbiAqIFtEN10gQmVsb3cgdGhpcyBtYWluLWNvbnRhaW5lciB3aWR0aCB0aGUgc2Vzc2lvbnMgc2lkZWJhciBpcyBhdXRvLW1hbmFnZWRcbiAqIGFnYWluc3QgdGhlIGVkaXRvciArIGF1eGlsaWFyeSBiYXIgdmlzaWJpbGl0eSBzbyBhbGwgdGhyZWUgZG9uJ3QgY29tcGV0ZSBmb3JcbiAqIGEgY3JhbXBlZCBob3Jpem9udGFsIGxheW91dC5cbiAqL1xuY29uc3QgU01BTExfV0lORE9XX01BWF9XSURUSCA9IDE4MDA7XG5cbi8qKiBbRDddIEV4cGVyaW1lbnRhbCBzZXR0aW5nIGdhdGluZyB0aGUgcmVzcG9uc2l2ZSBzZXNzaW9ucyBzaWRlYmFyLiAqL1xuZXhwb3J0IGNvbnN0IFJFU1BPTlNJVkVfU0lERUJBUl9TRVRUSU5HID0gJ3Nlc3Npb25zLmxheW91dC5hdXRvQ29sbGFwc2VTZXNzaW9uc1NpZGViYXInO1xuXG4vKipcbiAqIEZ1bGwgbGF5b3V0IGNvbnRyb2xsZXIgdXNlZCBvbiBkZXNrdG9wIGFuZCBvbiB0aGUgd2ViIGRlc2t0b3AgbGF5b3V0LiBJblxuICogYWRkaXRpb24gdG8gdGhlIHNoYXJlZCBwYW5lbCAvIHdvcmtpbmctc2V0IC8gc3RhdGUgbWFuYWdlbWVudCBvZlxuICoge0BsaW5rIEJhc2VMYXlvdXRDb250cm9sbGVyfSwgaXQgbWFuYWdlcyB0aGUgcGVyLXNlc3Npb24gYXV4aWxpYXJ5IGJhclxuICogdmlzaWJpbGl0eSBhbmQgYWN0aXZlIHZpZXcgY29udGFpbmVyLlxuICpcbiAqIEl0cyBiZWhhdmlvdXIgaXMgZW51bWVyYXRlZCBhcyBydWxlcyAqKkQxLUQxMSoqIGluXG4gKiBbZGVza3RvcFNlc3Npb25MYXlvdXRDb250cm9sbGVyLm1kXSguL2Rlc2t0b3BTZXNzaW9uTGF5b3V0Q29udHJvbGxlci5tZCkuXG4gKi9cbmV4cG9ydCBjbGFzcyBMYXlvdXRDb250cm9sbGVyIGV4dGVuZHMgQmFzZUxheW91dENvbnRyb2xsZXIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5zZXNzaW9uc0xheW91dENvbnRyb2xsZXInO1xuXG5cdC8qKlxuXHQgKiBTaGFyZWQgbGF5b3V0IHN0YXRlIGZvciB0aGUgbmV3LXNlc3Npb24gdmlldywgcGVyc2lzdGVkIGFjcm9zcyByZWxvYWRzLlxuXHQgKiBgdW5kZWZpbmVkYCBtZWFucyBubyBleHBsaWNpdCBjaG9pY2UgeWV0IChhdXggYmFyIGRlZmF1bHRzIHRvIHZpc2libGUpLlxuXHQgKi9cblx0cHJpdmF0ZSBfbmV3U2Vzc2lvblZpZXdTdGF0ZTogSU5ld1Nlc3Npb25WaWV3U3RhdGUgfCB1bmRlZmluZWQ7XG5cblx0LyoqIFtEN10gYHRydWVgIHdoaWxlIHRoZSBzaWRlYmFyIGlzIGhpZGRlbiBiZWNhdXNlIHRoZSBjb250cm9sbGVyIGF1dG8taGlkIGl0OyBvbmx5IHN1Y2ggaGlkZXMgYXJlIGF1dG8tcmV2ZXJ0ZWQuICovXG5cdHByb3RlY3RlZCBfc2lkZWJhckF1dG9IaWRkZW4gPSBmYWxzZTtcblx0LyoqIFtEN10gR3VhcmRzIHRoZSBtYW51YWwtdG9nZ2xlIGxpc3RlbmVyIHdoaWxlIHRoZSBjb250cm9sbGVyIGl0c2VsZiB0b2dnbGVzIHRoZSBzaWRlYmFyLiAqL1xuXHRwcm90ZWN0ZWQgX2FwcGx5aW5nQXV0b1NpZGViYXIgPSBmYWxzZTtcblx0LyoqIFtEN10gTGFzdCBjb21wdXRlZCBzcGFjZS1jb25zdHJhaW5lZCBzdGF0ZSwgc28gdGhlIGF1dG9ydW4gb25seSBhY3RzIG9uIHJlYWwgdHJhbnNpdGlvbnMuICovXG5cdHByaXZhdGUgX3ByZXZpb3VzU3BhY2VDb25zdHJhaW5lZCA9IGZhbHNlO1xuXG5cdC8qKiBbRDIvRDhdIGB0cnVlYCB3aGlsZSB0aGUgY29udHJvbGxlciBoaWRlcyB0aGUgc2lkZSBwYW5lIHRvIHJlc3RvcmUgYSBzZXNzaW9uJ3MgcmVtZW1iZXJlZCBzdGF0ZSwgc28gdGhlIGhpZGUgaXNuJ3QgY2FwdHVyZWQgYXMgYSB1c2VyIGNob2ljZS4gKi9cblx0cHJpdmF0ZSBfaGlkaW5nQXV4aWxpYXJ5QmFyRm9yUmVzdG9yZSA9IGZhbHNlO1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfcmVnaXN0ZXJWaWV3U3RhdGVNYW5hZ2VtZW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX2xvYWROZXdTZXNzaW9uVmlld1N0YXRlKCk7XG5cblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uSXNDcmVhdGVkT2JzID0gZGVyaXZlZDxib29sZWFuPihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBhY3RpdmVTZXNzaW9uPy5pc0NyZWF0ZWQucmVhZChyZWFkZXIpID8/IGZhbHNlO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbkhhc1dvcmtzcGFjZU9icyA9IGRlcml2ZWQ8Ym9vbGVhbj4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gYWN0aXZlU2Vzc2lvbj8ud29ya3NwYWNlLnJlYWQocmVhZGVyKT8uZm9sZGVycz8uWzBdPy5yb290ICE9PSB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBlZGl0b3JNYXhpbWl6ZWRPYnMgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsXG5cdFx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLm9uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkLFxuXHRcdFx0KCkgPT4gdGhpcy5fbGF5b3V0U2VydmljZS5pc0VkaXRvck1heGltaXplZCgpKTtcblxuXHRcdC8vIFN3aXRjaCBiZXR3ZWVuIHNlc3Npb25zIFx1MjAxNCBzeW5jIGF1eGlsaWFyeSBiYXJcblx0XHRsZXQgcHJldmlvdXNTZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcHJldmlvdXNJc0NyZWF0ZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3JNYXhpbWl6ZWQgPSBlZGl0b3JNYXhpbWl6ZWRPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvblJlc291cmNlID0gdGhpcy5hY3RpdmVTZXNzaW9uUmVzb3VyY2VPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaXNDcmVhdGVkID0gYWN0aXZlU2Vzc2lvbklzQ3JlYXRlZE9icy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdC8vIFtENV0gV2hpbGUgdGhlIGVkaXRvciBhcmVhIGlzIG1heGltaXplZCwgYWx3YXlzIHNob3cgdGhlIENoYW5nZXMgdmlld1xuXHRcdFx0Ly8gcmVnYXJkbGVzcyBvZiB0aGUgc2Vzc2lvbidzIHNhdmVkL3ByZXZpb3VzIHN0YXRlLiBUaGUgZm9yY2VkIHZpc2liaWxpdHlcblx0XHRcdC8vIGlzIG5ldmVyIGNhcHR1cmVkIChbRDJdIGxpc3RlbmVyIHNraXBzIHdoaWxlIG1heGltaXplZCksIHNvIHVuLW1heGltaXppbmdcblx0XHRcdC8vIHJlLXJ1bnMgdGhpcyBhdXRvcnVuIGFuZCByZXN0b3JlcyB0aGUgc2Vzc2lvbidzIHJlYWwgc3RhdGUuXG5cdFx0XHRpZiAoZWRpdG9yTWF4aW1pemVkKSB7XG5cdFx0XHRcdHByZXZpb3VzU2Vzc2lvblJlc291cmNlID0gYWN0aXZlU2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRwcmV2aW91c0lzQ3JlYXRlZCA9IGlzQ3JlYXRlZDtcblx0XHRcdFx0dm9pZCB0aGlzLl92aWV3c1NlcnZpY2Uub3BlblZpZXcoQ0hBTkdFU19WSUVXX0lELCBmYWxzZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbkhhc1dvcmtzcGFjZSA9IGFjdGl2ZVNlc3Npb25IYXNXb3Jrc3BhY2VPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgbXVsdGlwbGVWaXNpYmxlID0gdGhpcy5tdWx0aXBsZVNlc3Npb25zVmlzaWJsZU9icy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGlmIChtdWx0aXBsZVZpc2libGUpIHtcblx0XHRcdFx0cHJldmlvdXNTZXNzaW9uUmVzb3VyY2UgPSBhY3RpdmVTZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRcdHByZXZpb3VzSXNDcmVhdGVkID0gaXNDcmVhdGVkO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFtEMV0gU2F2ZSBhdXhpbGlhcnkgYmFyIHN0YXRlIGZvciB0aGUgc2Vzc2lvbiB3ZSdyZSBzd2l0Y2hpbmcgYXdheSBmcm9tXG5cdFx0XHRjb25zdCBpc1Nlc3Npb25Td2l0Y2ggPSBwcmV2aW91c1Nlc3Npb25SZXNvdXJjZSAhPT0gdW5kZWZpbmVkICYmICFpc0VxdWFsKHByZXZpb3VzU2Vzc2lvblJlc291cmNlLCBhY3RpdmVTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGlzU2Vzc2lvblN3aXRjaCkge1xuXHRcdFx0XHR0aGlzLl9jYXB0dXJlVmlld1N0YXRlKHByZXZpb3VzU2Vzc2lvblJlc291cmNlISk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFtENF0gU3VibWl0OiB0aGUgc2FtZSBzZXNzaW9uIHRyYW5zaXRpb25zIGZyb20gbmV3ICh1bmNyZWF0ZWQpIHRvIHJlYWwuXG5cdFx0XHRjb25zdCBpc1N1Ym1pdCA9IHByZXZpb3VzU2Vzc2lvblJlc291cmNlICE9PSB1bmRlZmluZWRcblx0XHRcdFx0JiYgIWlzU2Vzc2lvblN3aXRjaFxuXHRcdFx0XHQmJiAhcHJldmlvdXNJc0NyZWF0ZWRcblx0XHRcdFx0JiYgaXNDcmVhdGVkXG5cdFx0XHRcdCYmIGFjdGl2ZVNlc3Npb25SZXNvdXJjZSAhPT0gdW5kZWZpbmVkO1xuXG5cdFx0XHRwcmV2aW91c1Nlc3Npb25SZXNvdXJjZSA9IGFjdGl2ZVNlc3Npb25SZXNvdXJjZTtcblx0XHRcdHByZXZpb3VzSXNDcmVhdGVkID0gaXNDcmVhdGVkO1xuXG5cdFx0XHRpZiAoaXNTdWJtaXQpIHtcblx0XHRcdFx0dGhpcy5fd2l0aFNlc3Npb25MYXlvdXRSZXN0b3JlKCgpID0+IHRoaXMuX29uTmV3U2Vzc2lvblN1Ym1pdHRlZChhY3RpdmVTZXNzaW9uUmVzb3VyY2UhKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gW0QzXSBSZXN0b3JlIHRoZSBzZXNzaW9uJ3MgYXV4aWxpYXJ5IGJhciBzdGF0ZS5cblx0XHRcdHRoaXMuX3dpdGhTZXNzaW9uTGF5b3V0UmVzdG9yZSgoKSA9PlxuXHRcdFx0XHR0aGlzLl9zeW5jQXV4aWxpYXJ5QmFyVmlzaWJpbGl0eShhY3RpdmVTZXNzaW9uUmVzb3VyY2UsIGFjdGl2ZVNlc3Npb25IYXNXb3Jrc3BhY2UsIGlzQ3JlYXRlZClcblx0XHRcdCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gW0QyXSBUcmFjayBhdXhpbGlhcnkgYmFyIHZpc2liaWxpdHkgY2hhbmdlcyBieSB0aGUgdXNlciBzbyB0aGF0IGhpZGluZyB0aGVcblx0XHQvLyBTaWRlIFBhbmVsIGZvciBhIHNlc3Npb24gaXMgcmVtZW1iZXJlZCBpbW1lZGlhdGVseSAobm90IG9ubHkgb24gc3dpdGNoKS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sYXlvdXRTZXJ2aWNlLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkoZSA9PiB7XG5cdFx0XHRpZiAoZS5wYXJ0SWQgIT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIFtEOV0gVG9nZ2xpbmcgdGhlIHdob2xlIHNpZGUgcGFuZSAoZWRpdG9yICsgYXV4IGJhciB0b2dldGhlcikgaGlkZXMgb3Jcblx0XHRcdC8vIHNob3dzIHRoZSBhdXggYmFyIGFzIGEgc2lkZSBlZmZlY3QsIG5vdCBhcyBhIHBlci1zZXNzaW9uIGNob2ljZSwgc29cblx0XHRcdC8vIGRvbid0IHJlY29yZCBpdC5cblx0XHRcdGlmICh0aGlzLl90b2dnbGluZ1NpZGVQYW5lKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIEEgcmVzdG9yZS1kcml2ZW4gaGlkZSByZXBsYXlzIHRoZSByZW1lbWJlcmVkIHN0YXRlIHJhdGhlciB0aGFuXG5cdFx0XHQvLyByZWFjdGluZyB0byBhIHVzZXIgYWN0aW9uLCBzbyBkb24ndCByZWNvcmQgaXQgYXMgYSBuZXcgcGVyLXNlc3Npb25cblx0XHRcdC8vIGNob2ljZSAodGhpcyBrZWVwcyBcIm5vIHJlbWVtYmVyZWQgY2hvaWNlIHlldFwiIG1lYW5pbmdmdWwgZm9yIHRoZVxuXHRcdFx0Ly8gZmlyc3QtdGltZSBDaGFuZ2VzIHJldmVhbCwgRDgpLlxuXHRcdFx0aWYgKHRoaXMuX2hpZGluZ0F1eGlsaWFyeUJhckZvclJlc3RvcmUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gV2hpbGUgcmVzdG9yaW5nIGEgc2Vzc2lvbidzIGxheW91dCAoZS5nLiwgd29ya2luZy1zZXQgYXBwbHkgaW4gcHJvZ3Jlc3MpLFxuXHRcdFx0Ly8gdmlzaWJpbGl0eSBjaGFuZ2VzIHRyaWdnZXJlZCBieSB0aGUgc2luZ2xlLXBhbmUgZGV0YWlsLXBhbmVsIGxvZ2ljIG11c3Rcblx0XHRcdC8vIG5vdCBvdmVyd3JpdGUgdGhlIHNlc3Npb24ncyBpbnRlbmRlZCBzdGF0ZS5cblx0XHRcdGlmICh0aGlzLl9pc1Jlc3RvcmluZ1Nlc3Npb25MYXlvdXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMubXVsdGlwbGVTZXNzaW9uc1Zpc2libGVPYnMuZ2V0KCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gW0Q1XSBXaGlsZSBtYXhpbWl6ZWQgdGhlIGF1eCBiYXIgaXMgZm9yY2VkIHZpc2libGUsIHNvIGl0cyB2aXNpYmlsaXR5XG5cdFx0XHQvLyBtdXN0IG5vdCBiZSBjYXB0dXJlZCBhcyB0aGUgc2Vzc2lvbidzIHBlci1zZXNzaW9uIHByZWZlcmVuY2UuXG5cdFx0XHRpZiAodGhpcy5fbGF5b3V0U2VydmljZS5pc0VkaXRvck1heGltaXplZCgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRcdGlmICghYWN0aXZlU2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWFjdGl2ZVNlc3Npb24uaXNDcmVhdGVkLmdldCgpKSB7XG5cdFx0XHRcdHRoaXMuX3NldE5ld1Nlc3Npb25WaWV3U3RhdGUoeyBhdXhpbGlhcnlCYXJWaXNpYmxlOiBlLnZpc2libGUgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoZS52aXNpYmxlICYmIHRoaXMuX3Jlc3RvcmVTYXZlZEF1eGlsaWFyeUJhckNvbnRhaW5lck9uUmV2ZWFsKGFjdGl2ZVNlc3Npb24ucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2NhcHR1cmVWaWV3U3RhdGUoYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXJDaGFuZ2VzQXV0b1JldmVhbCgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXJSZXNwb25zaXZlU2lkZWJhcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyQXV4aWxpYXJ5QmFyUGFydFZpc2liaWxpdHkoKTtcblx0XHR0aGlzLl9yZWdpc3Rlck5ld1Nlc3Npb25SdWxlcygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9yZWdpc3RlckNoYW5nZXNBdXRvUmV2ZWFsKCk6IHZvaWQge1xuXHRcdC8vIFtEOF0gUmV2ZWFsIHRoZSBDaGFuZ2VzIHZpZXcgaW4gdGhlIHNpZGUgcGFuZSB0aGUgZmlyc3QgdGltZSBhIENoYW5nZXNcblx0XHQvLyBlZGl0b3IgaXMgb3BlbmVkIGZvciBhbiBleGlzdGluZyBzZXNzaW9uOyBhZnRlcndhcmRzIHJlc3BlY3QgdGhlXG5cdFx0Ly8gcmVtZW1iZXJlZCBwZXItc2Vzc2lvbiBjaG9pY2UgKEQxL0QyL0QzKS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCgpID0+IHRoaXMuX3JldmVhbENoYW5nZXNWaWV3T25GaXJzdE9wZW4oKSkpO1xuXG5cdFx0Ly8gW0Q4XSBSZS1vcGVuaW5nIHRoZSBDaGFuZ2VzIGVkaXRvciB3aGlsZSBpdCBpcyBhbHJlYWR5IHRoZSBhY3RpdmUgZWRpdG9yXG5cdFx0Ly8gKGUuZy4gYWZ0ZXIgdGhlIHdob2xlIHNpZGUgcGFuZSB3YXMgY2xvc2VkLCB3aGljaCBvbmx5IGhpZGVzIHRoZSBlZGl0b3Jcblx0XHQvLyBwYXJ0KSByZS1yZXZlYWxzIHRoZSBlZGl0b3IgcGFydCB3aXRob3V0IGZpcmluZyBhbiBhY3RpdmUtZWRpdG9yIGNoYW5nZSxcblx0XHQvLyBzbyBhbHNvIHJlYWN0IHRvIHRoZSBlZGl0b3IgcGFydCBiZWNvbWluZyB2aXNpYmxlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xheW91dFNlcnZpY2Uub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eShlID0+IHtcblx0XHRcdGlmIChlLnBhcnRJZCA9PT0gUGFydHMuRURJVE9SX1BBUlQgJiYgZS52aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuX3JldmVhbENoYW5nZXNWaWV3T25GaXJzdE9wZW4oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3JlZ2lzdGVyTmV3U2Vzc2lvblJ1bGVzKCk6IHZvaWQgeyB9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vblNlc3Npb25SZXBsYWNlZChmcm9tOiBJU2Vzc2lvbiwgdG86IElTZXNzaW9uKTogdm9pZCB7XG5cdFx0c3VwZXIuX29uU2Vzc2lvblJlcGxhY2VkKGZyb20sIHRvKTtcblxuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRjb25zdCByZXBsYWNlZFNlc3Npb25Jc0FjdGl2ZSA9IGlzRXF1YWwoYWN0aXZlU2Vzc2lvbj8ucmVzb3VyY2UsIGZyb20ucmVzb3VyY2UpIHx8IGlzRXF1YWwoYWN0aXZlU2Vzc2lvbj8ucmVzb3VyY2UsIHRvLnJlc291cmNlKTtcblx0XHRjb25zdCBhdXhpbGlhcnlCYXJWaXNpYmxlID0gcmVwbGFjZWRTZXNzaW9uSXNBY3RpdmVcblx0XHRcdD8gdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpXG5cdFx0XHQ6IHRoaXMuX25ld1Nlc3Npb25WaWV3U3RhdGU/LmF1eGlsaWFyeUJhclZpc2libGU7XG5cdFx0aWYgKGF1eGlsaWFyeUJhclZpc2libGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFtENF0gUHJlc2VydmUgdGhlIGRyYWZ0J3MgdmlzaWJsZSBjb250YWluZXI7IGEgaGlkZGVuIHBhbmUgdXNlcyB0aGUgcmV2ZWFsLXRpbWUgZGVmYXVsdC5cblx0XHR0aGlzLl92aWV3U3RhdGVCeVNlc3Npb24uc2V0KHRvLnJlc291cmNlLCB7XG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyQWN0aXZlVmlld0NvbnRhaW5lcklkOiByZXBsYWNlZFNlc3Npb25Jc0FjdGl2ZSAmJiBhdXhpbGlhcnlCYXJWaXNpYmxlXG5cdFx0XHRcdD8gdGhpcy5fcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik/LmdldElkKClcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogW0QxMF0gS2VlcCB0aGUgYXV4aWxpYXJ5LWJhciBwYXJ0IGhpZGRlbiB3aGVuIGl0IGhhcyBubyBhY3RpdmUgdmlld1xuXHQgKiBjb250YWluZXJzIChlLmcuIGEgd29ya3NwYWNlLWxlc3MgcXVpY2sgY2hhdCB3aGVyZSBDaGFuZ2VzK0ZpbGVzIGFyZSBnYXRlZFxuXHQgKiBvZmYpLCBzbyBhbiBlbXB0eSBjb2x1bW4gaXMgbmV2ZXIgc2hvd24uIFJlLWNoZWNrcyBvbiBjb250YWluZXIgYWRkL3JlbW92ZSxcblx0ICogbG9jYXRpb24gbW92ZXMsIGFjdGl2ZS12aWV3LWRlc2NyaXB0b3IgY2hhbmdlcyAodGhlIGdhdGluZyBzaWduYWwpLCBhbmRcblx0ICogYXV4LWJhciB2aXNpYmlsaXR5IGNoYW5nZXMuIE9ubHkgZXZlciBoaWRlcyBcdTIwMTQgcmV2ZWFscyBzdGF5IHdpdGggW0QzXS9bRDhdLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVnaXN0ZXJBdXhpbGlhcnlCYXJQYXJ0VmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbExpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgcmV3aXJlID0gKCk6IHZvaWQgPT4ge1xuXHRcdFx0bW9kZWxMaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHRcdGZvciAoY29uc3QgY29udGFpbmVyIG9mIHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyc0J5TG9jYXRpb24oVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikpIHtcblx0XHRcdFx0bW9kZWxMaXN0ZW5lcnMuYWRkKHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKVxuXHRcdFx0XHRcdC5vbkRpZENoYW5nZUFjdGl2ZVZpZXdEZXNjcmlwdG9ycygoKSA9PiB0aGlzLl9zeW5jQXV4aWxpYXJ5QmFyUGFydFZpc2liaWxpdHkoKSkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3luY0F1eGlsaWFyeUJhclBhcnRWaXNpYmlsaXR5KCk7XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl92aWV3RGVzY3JpcHRvclNlcnZpY2Uub25EaWRDaGFuZ2VWaWV3Q29udGFpbmVycyhyZXdpcmUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl92aWV3RGVzY3JpcHRvclNlcnZpY2Uub25EaWRDaGFuZ2VDb250YWluZXJMb2NhdGlvbihyZXdpcmUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl92aWV3c1NlcnZpY2Uub25EaWRDaGFuZ2VWaWV3Q29udGFpbmVyVmlzaWJpbGl0eShlID0+IHtcblx0XHRcdGlmIChlLmxvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKSB7XG5cdFx0XHRcdHRoaXMuX3N5bmNBdXhpbGlhcnlCYXJQYXJ0VmlzaWJpbGl0eSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHQvLyBUaGUgYXV4IHBhcnQgY2FuIGJlY29tZSB2aXNpYmxlIHdpdGhvdXQgYW55IGNvbnRhaW5lci0vZGVzY3JpcHRvci1jaGFuZ2Vcblx0XHQvLyBzaWduYWwgZmlyaW5nIChlLmcuIGEgYmFyZSBkZXRhaWwgdG9nZ2xlIHRoYXQgc2hvd3MgdGhlIHBhcnQgYmVmb3JlIGFueVxuXHRcdC8vIGNvbnRhaW5lciBpcyBvcGVuZWQsIG9yIGEgcmVzdG9yZSB0aGF0IHNob3dzIGl0IHdoaWxlIGl0cyBjb250YWluZXJzIGFyZVxuXHRcdC8vIGdhdGVkIG9mZikuIFJlYWN0IHRvIHRoZSBwYXJ0IGl0c2VsZiBiZWNvbWluZyB2aXNpYmxlIHNvIGFuIGVtcHR5IGNvbHVtblxuXHRcdC8vIGlzIHJlY29uY2lsZWQgYXdheSBhbmQgdGhlIHRvZ2dsZSBuZXZlciByZWFkcyBcIm9uXCIgb3ZlciBhIGJsYW5rIHBhbmVsLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xheW91dFNlcnZpY2Uub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eShlID0+IHtcblx0XHRcdGlmIChlLnBhcnRJZCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgZS52aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuX3N5bmNBdXhpbGlhcnlCYXJQYXJ0VmlzaWJpbGl0eSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRyZXdpcmUoKTtcblx0fVxuXG5cdC8qKiBbRDEwXSBIaWRlIHRoZSBhdXgtYmFyIHBhcnQgd2hlbiBpdCBoYXMgbm8gYWN0aXZlIHZpZXcgY29udGFpbmVyczsgbmV2ZXIgcmV2ZWFscyBpdC4gKi9cblx0cHJpdmF0ZSBfc3luY0F1eGlsaWFyeUJhclBhcnRWaXNpYmlsaXR5KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9oYXNBY3RpdmVBdXhWaWV3Q29udGFpbmVycygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIE5vIGFjdGl2ZSBhdXggdmlldyBjb250YWluZXJzLiBUaGlzIGlzIG9ubHkgYSBnZW51aW5lIFwiZW1wdHkgY29sdW1uXCIgZm9yIGFcblx0XHQvLyB3b3Jrc3BhY2UtbGVzcyBxdWljayBjaGF0IChDaGFuZ2VzK0ZpbGVzIHBlcm1hbmVudGx5IGdhdGVkIG9mZikuIEZvciBhXG5cdFx0Ly8gd29ya3NwYWNlLWJhY2tlZCBzZXNzaW9uIGl0IGlzIGEgdHJhbnNpZW50IHN0YXJ0dXAvYWN0aXZhdGlvbiBzdGF0ZSAodGhlXG5cdFx0Ly8gRmlsZXMvQ2hhbmdlcyB2aWV3cyBnYXRlIG9uIGBTZXNzaW9uSGFzV29ya3NwYWNlQ29udGV4dGAsIHNldCBhc3luYyBhZnRlclxuXHRcdC8vIHRoZSBzZXNzaW9uIGFjdGl2YXRlcyksIGFuZCBkdXJpbmcgZWFybHkgcmVsb2FkIHRoZXJlIGlzIG5vIGFjdGl2ZSBzZXNzaW9uXG5cdFx0Ly8geWV0IGF0IGFsbC4gSGlkaW5nIGluIHRob3NlIHRyYW5zaWVudCBjYXNlcyBjb2xsYXBzZXMgdGhlIHJlc3RvcmVkLXZpc2libGVcblx0XHQvLyBzaWRlIHBhbmUgYW5kLCBzaW5jZSB0aGlzIG1ldGhvZCBvbmx5IGV2ZXIgaGlkZXMsIGl0IHN0YXlzIGNsb3NlZCBcdTIwMTQgdGhlXG5cdFx0Ly8gcmVsb2FkIGZsaWNrZXIgKG9wZW5zIHRoZW4gY2xvc2VzKSBhbmQgXCJGaWxlcyBub3Qgc2hvd25cIi4gU28gaGlkZSBPTkxZIGZvclxuXHRcdC8vIGFuIGFjdHVhbCBxdWljayBjaGF0OyBhIHJlYWwgcXVpY2stY2hhdCBzd2l0Y2ggc3RpbGwgZmlyZXNcblx0XHQvLyBgb25EaWRDaGFuZ2VBY3RpdmVWaWV3RGVzY3JpcHRvcnNgLCB3aGljaCByZS1ydW5zIHRoaXMgYW5kIGhpZGVzIHRoZW4uXG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGlmIChhY3RpdmVTZXNzaW9uPy5pc1F1aWNrQ2hhdD8uZ2V0KCkgIT09IHRydWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSkge1xuXHRcdFx0Ly8gUmVtb3ZpbmcgYW4gZW1wdHkgY29sdW1uIG11c3Qgbm90LCBhcyBhIHNpZGUgZWZmZWN0LCBwb3AgdGhlIGVkaXRvclxuXHRcdFx0Ly8gb3BlbjogdGhlIGVkaXRvcidzIHZpc2liaWxpdHkgaXMgZ292ZXJuZWQgYnkgaXRzIG93biBydWxlcyAoW0QzXS9bRDhdKSxcblx0XHRcdC8vIG5vdCBieSB0aGlzIGNsZWFudXAuIFN1cHByZXNzIHRoZSBkb2NrZWQgc3dhcC1yZXZlYWwgZm9yIHRoZSBoaWRlLlxuXHRcdFx0Y29uc3Qgc3VwcHJlc3Npb24gPSB0aGlzLl9sYXlvdXRTZXJ2aWNlLnN1cHByZXNzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5KCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9oaWRlQXV4aWxpYXJ5QmFyRm9yUmVzdG9yZSgpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0c3VwcHJlc3Npb24uZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBbRDhdIFdoZW4gYSBDaGFuZ2VzIChtdWx0aS1kaWZmKSBlZGl0b3IgaXMgb3BlbmVkIChiZWNvbWVzIGFjdGl2ZSwgb3IgaXRzXG5cdCAqIGVkaXRvciBwYXJ0IGlzIHJlLXJldmVhbGVkKSBmb3IgYW4gZXhpc3Rpbmcgc2Vzc2lvbiwgc2hvdyB0aGUgQ2hhbmdlcyB2aWV3XG5cdCAqIGluIHRoZSBzaWRlIHBhbmUgdW5sZXNzIHRoZSB1c2VyIGV4cGxpY2l0bHkgaGlkIHRoZSBhdXggYmFyIGZvciB0aGF0XG5cdCAqIHNlc3Npb24uIFRoaXMgcmV2ZWFscyBpdCB0aGUgZmlyc3QgdGltZSAobm8gcmVtZW1iZXJlZCBjaG9pY2UpIGFuZCBhZ2FpblxuXHQgKiBhZnRlciB0aGUgd2hvbGUgc2lkZSBwYW5lIHdhcyBjbG9zZWQgKEQ5LCB3aGljaCBrZWVwcyB0aGUgcmVtZW1iZXJlZCBjaG9pY2Vcblx0ICogXCJvcGVuXCIpLCBidXQgcmVzcGVjdHMgYW4gZXhwbGljaXQgYXV4LWJhci1oaWRkZW4gY2hvaWNlLiBUaGUgcmV2ZWFsIGlzXG5cdCAqIGNhcHR1cmVkIGJ5IFtEMl0uIFNraXBwZWQgd2hpbGUgYSBzaWRlLXBhbmUgdG9nZ2xlIGlzIGluIHByb2dyZXNzIChzbyB0aGVcblx0ICogdG9nZ2xlIHJlc3RvcmVzIGV4YWN0bHkgdGhlIHJlbWVtYmVyZWQgcGFydHMsIEQ5KSwgd2hpbGUgdGhlIGVkaXRvciBpc1xuXHQgKiBtYXhpbWl6ZWQgKEQ1KSBvciB3aGlsZSBtdWx0aXBsZSBzZXNzaW9ucyBhcmUgdmlzaWJsZSwgd2hlcmUgdGhlIHNpZGUgcGFuZVxuXHQgKiBpcyBtYW5hZ2VkIGJ5IG90aGVyIHJ1bGVzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmV2ZWFsQ2hhbmdlc1ZpZXdPbkZpcnN0T3BlbigpOiB2b2lkIHtcblx0XHQvLyBBIHNpZGUtcGFuZSB0b2dnbGUgcmVzdG9yZXMgZXhhY3RseSB0aGUgcmVtZW1iZXJlZCBwYXJ0czsgZG9uJ3QgbGV0IHRoZVxuXHRcdC8vIGVkaXRvciBwYXJ0IGl0IHJldmVhbHMgZm9yY2UgdGhlIENoYW5nZXMgdmlldyBvcGVuIChEOSkuXG5cdFx0aWYgKHRoaXMuX3RvZ2dsaW5nU2lkZVBhbmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUmVzb3VyY2UgPSB0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcj8ucmVzb3VyY2U7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3JSZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjaGFuZ2VzU2Vzc2lvblJlc291cmNlID0gdGhpcy5fc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmdldFNlc3Npb25SZXNvdXJjZShhY3RpdmVFZGl0b3JSZXNvdXJjZSk7XG5cdFx0aWYgKCFjaGFuZ2VzU2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLm11bHRpcGxlU2Vzc2lvbnNWaXNpYmxlT2JzLmdldCgpIHx8IHRoaXMuX2xheW91dFNlcnZpY2UuaXNFZGl0b3JNYXhpbWl6ZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFhY3RpdmVTZXNzaW9uIHx8ICFpc0VxdWFsKGFjdGl2ZVNlc3Npb24ucmVzb3VyY2UsIGNoYW5nZXNTZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFVuY3JlYXRlZCAodW50aXRsZWQpIHNlc3Npb25zIHNoYXJlIHRoZSBuZXctc2Vzc2lvbiBzaWRlLXBhbmUgc3RhdGUgKEQzYi9ENCkuXG5cdFx0aWYgKCFhY3RpdmVTZXNzaW9uLmlzQ3JlYXRlZC5nZXQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBBIHJlc3RvcmVkIENoYW5nZXMgZWRpdG9yIGNhbiBiZWNvbWUgYWN0aXZlIHdoaWxlIHRoZSBlZGl0b3IgcGFydCBpc1xuXHRcdC8vIHN0aWxsIGhpZGRlbiAoZS5nLiBpdHMgd29ya2luZyBzZXQgaXMgcmVzdG9yZWQgb24gcmVsb2FkKS4gT25seSByZXZlYWxcblx0XHQvLyB0aGUgc2lkZSBwYW5lIHdoZW4gdGhlIHVzZXIgYWN0dWFsbHkgb3BlbmVkIHRoZSBlZGl0b3IgKHBhcnQgdmlzaWJsZSkuXG5cdFx0aWYgKCF0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2F2ZWRTdGF0ZSA9IHRoaXMuX3ZpZXdTdGF0ZUJ5U2Vzc2lvbi5nZXQoY2hhbmdlc1Nlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKHNhdmVkU3RhdGUpIHtcblx0XHRcdC8vIFtEOF0gQWxyZWFkeSBvcGVuLCBvciBhbiBleHBsaWNpdCBhdXgtYmFyIGhpZGUgKG5vdCBhIEQ5IGNvbGxhcHNlKS5cblx0XHRcdGlmICh0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzYXZlZFN0YXRlLmF1eGlsaWFyeUJhclZpc2libGUgJiYgIXNhdmVkU3RhdGUuYXV4aWxpYXJ5QmFySGlkZGVuQnlDb2xsYXBzZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHZvaWQgdGhpcy5fdmlld3NTZXJ2aWNlLm9wZW5WaWV3KENIQU5HRVNfVklFV19JRCwgZmFsc2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9uIGEgc21hbGwgd2luZG93LCBhdXRvLWhpZGUgdGhlIHNlc3Npb25zIHNpZGViYXIgd2hpbGUgYm90aCB0aGUgZWRpdG9yIGFuZFxuXHQgKiBhdXhpbGlhcnkgYmFyIGFyZSBvcGVuIGFuZCBhdXRvLXNob3cgaXQgYWdhaW4gb25jZSBlaXRoZXIgY2xvc2VzIFx1MjAxNCB1bmxlc3MgdGhlXG5cdCAqIHVzZXIgY2xvc2VkIHRoZSBzaWRlYmFyIHRoZW1zZWx2ZXMuIERpc2FibGVkIHdoaWxlIG11bHRpcGxlIHNlc3Npb25zIGFyZVxuXHQgKiB2aXNpYmxlIGFuZCBuZXZlciB0cmlnZ2VyZWQgYnkgc2Vzc2lvbiBuYXZpZ2F0aW9uLiBHYXRlZCBieSB0aGUgZXhwZXJpbWVudGFsXG5cdCAqIGBzZXNzaW9ucy5sYXlvdXQuYXV0b0NvbGxhcHNlU2Vzc2lvbnNTaWRlYmFyYCBzZXR0aW5nLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9yZWdpc3RlclJlc3BvbnNpdmVTaWRlYmFyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVuYWJsZWRPYnMgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWU8Ym9vbGVhbj4oUkVTUE9OU0lWRV9TSURFQkFSX1NFVFRJTkcsIHByb2R1Y3QucXVhbGl0eSAhPT0gJ3N0YWJsZScsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNtYWxsV2luZG93T2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLFxuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5vbkRpZExheW91dE1haW5Db250YWluZXIsXG5cdFx0XHQoKSA9PiB0aGlzLl9sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXJEaW1lbnNpb24ud2lkdGggPD0gU01BTExfV0lORE9XX01BWF9XSURUSCk7XG5cblx0XHRjb25zdCBlZGl0b3JWaXNpYmxlT2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLFxuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LFxuXHRcdFx0KCkgPT4gdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpKTtcblxuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclZpc2libGVPYnMgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsXG5cdFx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHksXG5cdFx0XHQoKSA9PiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkpO1xuXG5cdFx0Y29uc3QgZWRpdG9yTWF4aW1pemVkT2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLFxuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5vbkRpZENoYW5nZUVkaXRvck1heGltaXplZCxcblx0XHRcdCgpID0+IHRoaXMuX2xheW91dFNlcnZpY2UuaXNFZGl0b3JNYXhpbWl6ZWQoKSk7XG5cblx0XHQvLyBbRDddIERpc2FibGVkIHdoaWxlIG11bHRpcGxlIHNlc3Npb25zIGFyZSB2aXNpYmxlLlxuXHRcdGNvbnN0IHNwYWNlQ29uc3RyYWluZWRPYnMgPSBkZXJpdmVkPGJvb2xlYW4+KHJlYWRlciA9PlxuXHRcdFx0ZW5hYmxlZE9icy5yZWFkKHJlYWRlcikgJiZcblx0XHRcdCF0aGlzLm11bHRpcGxlU2Vzc2lvbnNWaXNpYmxlT2JzLnJlYWQocmVhZGVyKSAmJlxuXHRcdFx0c21hbGxXaW5kb3dPYnMucmVhZChyZWFkZXIpICYmXG5cdFx0XHRlZGl0b3JWaXNpYmxlT2JzLnJlYWQocmVhZGVyKSAmJlxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZU9icy5yZWFkKHJlYWRlcikpO1xuXG5cdFx0dGhpcy5fcHJldmlvdXNTcGFjZUNvbnN0cmFpbmVkID0gc3BhY2VDb25zdHJhaW5lZE9icy5nZXQoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8vIFdoaWxlIHRoZSBlZGl0b3IgaXMgbWF4aW1pemVkIHRoZSBzaWRlIGxheW91dCBpcyBmb3JjZWQgKEQ1KTsgbGVhdmUgdGhlXG5cdFx0XHQvLyBzaWRlYmFyIHRvIHRoZSBtYXhpbWl6ZS9yZXN0b3JlIGxvZ2ljIGFuZCByZS1ldmFsdWF0ZSBvbiB1bi1tYXhpbWl6ZS5cblx0XHRcdGlmIChlZGl0b3JNYXhpbWl6ZWRPYnMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29uc3RyYWluZWQgPSBzcGFjZUNvbnN0cmFpbmVkT2JzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Ly8gW0Q3XSBXaGlsZSB0aGUgY29udHJvbGxlciByZXN0b3JlcyBhIHNlc3Npb24ncyBsYXlvdXQgKGUuZy4gc3dpdGNoaW5nXG5cdFx0XHQvLyBzZXNzaW9ucyByZXZlYWxzIHRoZSBzYXZlZCBzaWRlIHBhbmVsKSwgcmUtYmFzZWxpbmUgaW5zdGVhZCBvZiByZWFjdGluZ1xuXHRcdFx0Ly8gc28gbmF2aWdhdGlvbiBuZXZlciBhdXRvLWhpZGVzIHRoZSBzaWRlYmFyIFx1MjAxNCBvbmx5IGluLXNlc3Npb24gY2hhbmdlcyBkby5cblx0XHRcdGlmICh0aGlzLl9pc1Jlc3RvcmluZ1Nlc3Npb25MYXlvdXQpIHtcblx0XHRcdFx0dGhpcy5fcHJldmlvdXNTcGFjZUNvbnN0cmFpbmVkID0gY29uc3RyYWluZWQ7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbnN0cmFpbmVkID09PSB0aGlzLl9wcmV2aW91c1NwYWNlQ29uc3RyYWluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcHJldmlvdXNTcGFjZUNvbnN0cmFpbmVkID0gY29uc3RyYWluZWQ7XG5cblx0XHRcdGlmIChjb25zdHJhaW5lZCkge1xuXHRcdFx0XHQvLyBPbmx5IHJlbWVtYmVyIGFuIGF1dG8taGlkZSB3aGVuIHdlIGFjdHVhbGx5IGhpZCBhIHZpc2libGUgc2lkZWJhcjsgYVxuXHRcdFx0XHQvLyBzaWRlYmFyIHRoYXQgd2FzIGFscmVhZHkgY2xvc2VkIChlLmcuIGJ5IHRoZSB1c2VyLCBpbmNsdWRpbmcgYmVmb3JlIGFcblx0XHRcdFx0Ly8gcmVsb2FkKSBtdXN0IG5vdCBiZSBhdXRvLXJldmVhbGVkIHdoZW4gc3BhY2UgaXMgbm8gbG9uZ2VyIGNvbnN0cmFpbmVkLlxuXHRcdFx0XHRpZiAodGhpcy5fc2V0U2lkZWJhckF1dG9IaWRkZW4odHJ1ZSkpIHtcblx0XHRcdFx0XHR0aGlzLl9zaWRlYmFyQXV0b0hpZGRlbiA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodGhpcy5fc2lkZWJhckF1dG9IaWRkZW4pIHtcblx0XHRcdFx0dGhpcy5fc2V0U2lkZWJhckF1dG9IaWRkZW4oZmFsc2UpO1xuXHRcdFx0XHR0aGlzLl9zaWRlYmFyQXV0b0hpZGRlbiA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEEgbWFudWFsIHNpZGViYXIgdG9nZ2xlIGhhbmRzIGNvbnRyb2wgYmFjayB0byB0aGUgdXNlcjogc3RvcCB0cmFja2luZyB0aGVcblx0XHQvLyBzaWRlYmFyIGFzIGF1dG8taGlkZGVuIHNvIGEgbGF0ZXIgdW4tY29uc3RyYWluIG5laXRoZXIgcmVvcGVucyBhIHNpZGViYXIgdGhlXG5cdFx0Ly8gdXNlciBjbG9zZWQgbm9yIHJlLWhpZGVzIG9uZSB0aGV5IG9wZW5lZC4gTWF4aW1pemUgdG9nZ2xlcyB0aGUgc2lkZWJhciB0b28sXG5cdFx0Ly8gYnV0IGl0cyBlbnRlci9yZXN0b3JlIHBhaXIgc2VsZi1jYW5jZWxzIGhlcmUsIHNvIGl0IG5lZWRzIG5vIHNwZWNpYWwgaGFuZGxpbmcuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGF5b3V0U2VydmljZS5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5KGUgPT4ge1xuXHRcdFx0aWYgKGUucGFydElkICE9PSBQYXJ0cy5TSURFQkFSX1BBUlQgfHwgdGhpcy5fYXBwbHlpbmdBdXRvU2lkZWJhcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zaWRlYmFyQXV0b0hpZGRlbiA9IGZhbHNlO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKiBSZXR1cm5zIGB0cnVlYCB3aGVuIHRoZSBzaWRlYmFyIHZpc2liaWxpdHkgd2FzIGFjdHVhbGx5IGNoYW5nZWQuICovXG5cdHByb3RlY3RlZCBfc2V0U2lkZWJhckF1dG9IaWRkZW4oaGlkZGVuOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlNJREVCQVJfUEFSVCkgPT09ICFoaWRkZW4pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fYXBwbHlpbmdBdXRvU2lkZWJhciA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihoaWRkZW4sIFBhcnRzLlNJREVCQVJfUEFSVCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2FwcGx5aW5nQXV0b1NpZGViYXIgPSBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyBbQjRdIFNuYXBzaG90IHRoZSBhY3RpdmUgc2Vzc2lvbidzIGF1eC1iYXIgc3RhdGUgd2hlbiBwZXJzaXN0aW5nLlxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2NhcHR1cmVBY3RpdmVTZXNzaW9uVmlld1N0YXRlKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FwdHVyZVZpZXdTdGF0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFtEOWJdIFJlY29yZHMgYSB3aG9sZS1zaWRlLXBhbmUgdG9nZ2xlIGZvciB0aGUgYWN0aXZlIHNlc3Npb24uIEZvciBhblxuXHQgKiB1bmNyZWF0ZWQgc2Vzc2lvbiBpdCB1cGRhdGVzIHRoZSBzaGFyZWQgbmV3LXNlc3Npb24gY2hvaWNlLiBGb3IgYSBjcmVhdGVkXG5cdCAqIHNlc3Npb24sIG9ubHkgYSBmdWxsIGNvbGxhcHNlIG9mIGEgcHJldmlvdXNseS12aXNpYmxlIGF1eCBiYXIgaXMgbWFya2VkIGFzIGFcblx0ICogY29sbGFwc2UtZHJpdmVuIGhpZGUgKHNvIG9wZW5pbmcgQ2hhbmdlcyBsYXRlciByZS1yZXZlYWxzIGl0KTsgYW55IG90aGVyXG5cdCAqIG91dGNvbWUganVzdCBjYXB0dXJlcyB0aGUgcmVzdWx0aW5nIHN0YXRlLCBwcmVzZXJ2aW5nIGFuIGV4cGxpY2l0IGF1eC1iYXJcblx0ICogaGlkZS4gU2VlIGBkZXNrdG9wU2Vzc2lvbkxheW91dENvbnRyb2xsZXIubWRgLlxuXHQgKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vblNpZGVQYW5lVG9nZ2xlZChjb2xsYXBzZWQ6IGJvb2xlYW4sIHByZXZpb3VzQXV4aWxpYXJ5QmFyVmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLm11bHRpcGxlU2Vzc2lvbnNWaXNpYmxlT2JzLmdldCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzRWRpdG9yTWF4aW1pemVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGlmICghYWN0aXZlU2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIWFjdGl2ZVNlc3Npb24uaXNDcmVhdGVkLmdldCgpKSB7XG5cdFx0XHR0aGlzLl9zZXROZXdTZXNzaW9uVmlld1N0YXRlKHsgYXV4aWxpYXJ5QmFyVmlzaWJsZTogdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoY29sbGFwc2VkICYmIHByZXZpb3VzQXV4aWxpYXJ5QmFyVmlzaWJsZSkge1xuXHRcdFx0Y29uc3QgYWN0aXZlVmlld0NvbnRhaW5lcklkID0gdGhpcy5fcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik/LmdldElkKCk7XG5cdFx0XHR0aGlzLl92aWV3U3RhdGVCeVNlc3Npb24uc2V0KGFjdGl2ZVNlc3Npb24ucmVzb3VyY2UsIHtcblx0XHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRcdGF1eGlsaWFyeUJhckFjdGl2ZVZpZXdDb250YWluZXJJZDogYWN0aXZlVmlld0NvbnRhaW5lcklkLFxuXHRcdFx0XHRhdXhpbGlhcnlCYXJIaWRkZW5CeUNvbGxhcHNlOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFJlLW9wZW5lZCwgb3IgY29sbGFwc2VkIGFuIGFscmVhZHktaGlkZGVuIGF1eCBiYXI6IGNhcHR1cmUgdGhlIHJlc3VsdGluZ1xuXHRcdC8vIHN0YXRlIHdpdGhvdXQgZmFicmljYXRpbmcgYSBjb2xsYXBzZSBtYXJrZXIgKHByZXNlcnZpbmcgZXhwbGljaXQgaGlkZXMpLlxuXHRcdHRoaXMuX2NhcHR1cmVWaWV3U3RhdGUoYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZSk7XG5cdH1cblxuXHQvLyAtLS0gQXV4aWxpYXJ5IGJhciBbRDFdIC0tLVxuXG5cdHByaXZhdGUgX2NhcHR1cmVWaWV3U3RhdGUoc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBhdXhpbGlhcnlCYXJWaXNpYmxlID0gdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdGNvbnN0IGFjdGl2ZVZpZXdDb250YWluZXJJZCA9IHRoaXMuX3BhbmVDb21wb3NpdGVQYXJ0U2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpPy5nZXRJZCgpO1xuXHRcdC8vIFtEOV0gUHJlc2VydmUgYSBjb2xsYXBzZSBtYXJrZXIgd2hpbGUgdGhlIGF1eCBiYXIgc3RheXMgaGlkZGVuOyB0aGVcblx0XHQvLyBtYXJrZXIgaXMgb25seSBldmVyIHNldCBieSBgX29uU2lkZVBhbmVUb2dnbGVkYCBmb3IgdGhlIHNlc3Npb24gdGhhdCB3YXNcblx0XHQvLyBjb2xsYXBzZWQsIHNvIGFuIGV4cGxpY2l0IGF1eC1iYXIgaGlkZSBpcyBuZXZlciBtaXN0YWtlbiBmb3IgYSBjb2xsYXBzZS5cblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX3ZpZXdTdGF0ZUJ5U2Vzc2lvbi5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBhdXhpbGlhcnlCYXJIaWRkZW5CeUNvbGxhcHNlID0gIWF1eGlsaWFyeUJhclZpc2libGUgJiYgcHJldmlvdXM/LmF1eGlsaWFyeUJhckhpZGRlbkJ5Q29sbGFwc2UgPT09IHRydWU7XG5cdFx0dGhpcy5fdmlld1N0YXRlQnlTZXNzaW9uLnNldChzZXNzaW9uUmVzb3VyY2UsIHtcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGUsXG5cdFx0XHRhdXhpbGlhcnlCYXJBY3RpdmVWaWV3Q29udGFpbmVySWQ6IGFjdGl2ZVZpZXdDb250YWluZXJJZCxcblx0XHRcdC4uLihhdXhpbGlhcnlCYXJIaWRkZW5CeUNvbGxhcHNlID8geyBhdXhpbGlhcnlCYXJIaWRkZW5CeUNvbGxhcHNlOiB0cnVlIH0gOiB7fSksXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXROZXdTZXNzaW9uVmlld1N0YXRlKHN0YXRlOiBJTmV3U2Vzc2lvblZpZXdTdGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuX25ld1Nlc3Npb25WaWV3U3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShORVdfU0VTU0lPTl9WSUVXX1NUQVRFX0tFWSwgSlNPTi5zdHJpbmdpZnkoc3RhdGUpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFtENF0gV2hlbiBhIG5ldyAodW5jcmVhdGVkKSBzZXNzaW9uIGlzIHN1Ym1pdHRlZCBpdCBiZWNvbWVzIGEgcmVhbCBzZXNzaW9uXG5cdCAqIHdoaWxlIHN0YXlpbmcgYWN0aXZlLiBLZWVwIHRoZSBhdXhpbGlhcnkgYmFyIGV4YWN0bHkgYXMgdGhlIHVzZXIgbGVmdCBpdDogaWZcblx0ICogb3Blbiwga2VlcCBpdCBvcGVuIG9uIHRoZSBjb250YWluZXIgaXQgaXMgYWxyZWFkeSBzaG93aW5nOyBpZiBjbG9zZWQsIGtlZXAgaXRcblx0ICogY2xvc2VkIGFuZCByZWNvcmQgbm8gY29udGFpbmVyIHNvIG9wZW5pbmcgdGhlIHNpZGUgcGFuZSBsYXRlciBwaWNrcyB0aGVcblx0ICogZGVmYXVsdCBmb3IgdGhlIHNlc3Npb24ncyBjaGFuZ2Ugc3RhdGUgYXQgdGhhdCB0aW1lIChbRDNkXSkuIFRoZSByZXN1bHRpbmdcblx0ICogc3RhdGUgaXMgcGVyc2lzdGVkIHNvIGxhdGVyIHN5bmNzIGRvbid0IGZhbGwgYmFjayB0byBoaWRkZW4uXG5cdCAqL1xuXHRwcml2YXRlIF9vbk5ld1Nlc3Npb25TdWJtaXR0ZWQoc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBhdXhpbGlhcnlCYXJWaXNpYmxlID0gdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdHRoaXMuX3ZpZXdTdGF0ZUJ5U2Vzc2lvbi5zZXQoc2Vzc2lvblJlc291cmNlLCB7XG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyQWN0aXZlVmlld0NvbnRhaW5lcklkOiBhdXhpbGlhcnlCYXJWaXNpYmxlXG5cdFx0XHRcdD8gdGhpcy5fcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik/LmdldElkKClcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH1cblxuXHQvLyBbRDNdIFJlc3RvcmUgdGhlIGF1eGlsaWFyeSBiYXIgaW4gc3RyaWN0IHByaW9yaXR5IG9yZGVyLlxuXHQvLyBOb3RlOiBUaGlzIG1ldGhvZCBpcyBpbnRlbnRpb25hbGx5IHN5bmNocm9ub3VzICh2b2lkIHJldHVybikuIFZpZXctb3BlbmluZyBjYWxscyBhcmVcblx0Ly8gZmlyZS1hbmQtZm9yZ2V0IHNvIHRoYXQgX2lzUmVzdG9yaW5nU2Vzc2lvbkxheW91dCBlbmRzIGltbWVkaWF0ZWx5IGFmdGVyIHN5bmMgb3BlcmF0aW9ucy5cblx0Ly8gVGhpcyBhbGxvd3MgRDIgdG8gY2FwdHVyZSB1c2VyIGFjdGlvbnMgdGhhdCBoYXBwZW4gYWZ0ZXIgdGhlIHN5bmMgcmVzdG9yZSBidXQgYmVmb3JlXG5cdC8vIHdvcmtpbmctc2V0IGFwcGx5LCB3aGlsZSBzdGlsbCBza2lwcGluZyBzaW5nbGUtcGFuZSBkZXRhaWwtcGFuZWwgcmV2ZWFscyBkdXJpbmcgd29ya2luZy1zZXQgYXBwbHkuXG5cdHByaXZhdGUgX3N5bmNBdXhpbGlhcnlCYXJWaXNpYmlsaXR5KHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBoYXNXb3Jrc3BhY2U6IGJvb2xlYW4sIGlzQ3JlYXRlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIFtEM2FdIE5vIHJlc291cmNlIC8gbm8gd29ya3NwYWNlIFx1MjE5MiBkbyBub3RoaW5nLlxuXHRcdGlmICghc2Vzc2lvblJlc291cmNlIHx8ICFoYXNXb3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBbRDNiXSBOZXctc2Vzc2lvbiB2aWV3OiBhbGwgdW5jcmVhdGVkIHNlc3Npb25zIHNoYXJlIG9uZSBzdGF0ZS5cblx0XHRpZiAoIWlzQ3JlYXRlZCkge1xuXHRcdFx0aWYgKHRoaXMuX25ld1Nlc3Npb25WaWV3U3RhdGUgJiYgIXRoaXMuX25ld1Nlc3Npb25WaWV3U3RhdGUuYXV4aWxpYXJ5QmFyVmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLl9oaWRlQXV4aWxpYXJ5QmFyRm9yUmVzdG9yZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR2b2lkIHRoaXMuX29wZW5EZWZhdWx0QXV4aWxpYXJ5QmFyQ29udGFpbmVyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2F2ZWRTdGF0ZSA9IHRoaXMuX3ZpZXdTdGF0ZUJ5U2Vzc2lvbi5nZXQoc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdC8vIFtEM2NdIEV4aXN0aW5nIHNlc3Npb25zIGFyZSBuZXZlciBhdXRvLW9wZW5lZDogaGlkZSB1bmxlc3MgZXhwbGljaXRseSBsZWZ0IHZpc2libGUuXG5cdFx0aWYgKCFzYXZlZFN0YXRlIHx8ICFzYXZlZFN0YXRlLmF1eGlsaWFyeUJhclZpc2libGUpIHtcblx0XHRcdHRoaXMuX2hpZGVBdXhpbGlhcnlCYXJGb3JSZXN0b3JlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gW0QzY10gUmVzdG9yZSB0aGUgdXNlcidzIGxhc3QgZXhwbGljaXQgY2hvaWNlLCBidXQgb25seSBpZiB0aGF0IHBhbmUgaXMgc3RpbGwgcGlubmVkLlxuXHRcdGNvbnN0IHNhdmVkQ29udGFpbmVySWQgPSBzYXZlZFN0YXRlLmF1eGlsaWFyeUJhckFjdGl2ZVZpZXdDb250YWluZXJJZDtcblx0XHRpZiAoc2F2ZWRDb250YWluZXJJZCAmJiB0aGlzLl9pc0F1eGlsaWFyeUJhckNvbnRhaW5lclBpbm5lZChzYXZlZENvbnRhaW5lcklkKSkge1xuXHRcdFx0dm9pZCB0aGlzLl92aWV3c1NlcnZpY2Uub3BlblZpZXdDb250YWluZXIoc2F2ZWRDb250YWluZXJJZCwgZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZvaWQgdGhpcy5fb3BlbkRlZmF1bHRBdXhpbGlhcnlCYXJDb250YWluZXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBbRDNkXSBUaGUgY29udGFpbmVyIHRoZSBzaWRlIHBhbmUgZGVmYXVsdHMgdG8gZm9yIHRoZSBhY3RpdmUgc2Vzc2lvbjpcblx0ICogQ2hhbmdlcyBvbmNlIHRoZSBzZXNzaW9uIGhhcyBwcm9kdWNlZCBhdCBsZWFzdCBvbmUgY2hhbmdlIChpbiBhbnkgb2YgaXRzXG5cdCAqIGNoYXRzKSwgRmlsZXMgdW50aWwgdGhlbi4gRmFsbHMgYmFjayB0byBDaGFuZ2VzIHdoZW4gdGhlIHVzZXIgaGFzIHVucGlubmVkXG5cdCAqIHRoZSBGaWxlcyBwYW5lLCBzaW5jZSB0aGVyZSBpcyBub3RoaW5nIGVsc2UgdG8gc2hvdy5cblx0ICpcblx0ICogUmVhZCB1bnRyYWNrZWQgb24gcHVycG9zZTogdGhlIGRlZmF1bHQgaXMgZXZhbHVhdGVkIGF0IHRoZSBtb21lbnQgdGhlIHNpZGVcblx0ICogcGFuZSBpcyBvcGVuZWQsIHNvIGEgY2hhbmdlIGxhbmRpbmcgbGF0ZXIgbmV2ZXIgc3dpdGNoZXMgYSBwYW5lIHRoZSB1c2VyIGlzXG5cdCAqIGFscmVhZHkgbG9va2luZyBhdC5cblx0ICovXG5cdHByaXZhdGUgX2RlZmF1bHRBdXhpbGlhcnlCYXJDb250YWluZXJJZCgpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5faXNBdXhpbGlhcnlCYXJDb250YWluZXJQaW5uZWQoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSkge1xuXHRcdFx0cmV0dXJuIENIQU5HRVNfVklFV19DT05UQUlORVJfSUQ7XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRyZXR1cm4gYWN0aXZlU2Vzc2lvbiAmJiBzZXNzaW9uSGFzQ2hhbmdlcyhhY3RpdmVTZXNzaW9uLCB1bmRlZmluZWQpXG5cdFx0XHQ/IENIQU5HRVNfVklFV19DT05UQUlORVJfSURcblx0XHRcdDogU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEO1xuXHR9XG5cblx0LyoqIFtEM2RdIE9wZW5zIHRoZSBjb250YWluZXIgY2hvc2VuIGJ5IHtAbGluayBfZGVmYXVsdEF1eGlsaWFyeUJhckNvbnRhaW5lcklkfS4gKi9cblx0cHJpdmF0ZSBfb3BlbkRlZmF1bHRBdXhpbGlhcnlCYXJDb250YWluZXIoY29udGFpbmVySWQ6IHN0cmluZyA9IHRoaXMuX2RlZmF1bHRBdXhpbGlhcnlCYXJDb250YWluZXJJZCgpKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0Ly8gQ2hhbmdlcyBpcyBvcGVuZWQgdGhyb3VnaCBpdHMgdmlldyBzbyB0aGUgdmlldyBpcyByZXZlYWxlZCBpbnNpZGUgdGhlXG5cdFx0Ly8gY29udGFpbmVyIHJhdGhlciB0aGFuIGxlYXZpbmcgdGhlIGNvbnRhaW5lciBvbiBhIHN0YWxlIHN1Yi12aWV3LlxuXHRcdGlmIChjb250YWluZXJJZCA9PT0gQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3ZpZXdzU2VydmljZS5vcGVuVmlldyhDSEFOR0VTX1ZJRVdfSUQsIGZhbHNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXdzU2VydmljZS5vcGVuVmlld0NvbnRhaW5lcihjb250YWluZXJJZCwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzdG9yZVNhdmVkQXV4aWxpYXJ5QmFyQ29udGFpbmVyT25SZXZlYWwoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRjb25zdCBzYXZlZFN0YXRlID0gdGhpcy5fdmlld1N0YXRlQnlTZXNzaW9uLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghc2F2ZWRTdGF0ZSB8fCBzYXZlZFN0YXRlLmF1eGlsaWFyeUJhclZpc2libGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBzYXZlZENvbnRhaW5lcklkID0gc2F2ZWRTdGF0ZS5hdXhpbGlhcnlCYXJBY3RpdmVWaWV3Q29udGFpbmVySWQ7XG5cdFx0aWYgKHNhdmVkQ29udGFpbmVySWQgJiYgdGhpcy5faXNBdXhpbGlhcnlCYXJDb250YWluZXJQaW5uZWQoc2F2ZWRDb250YWluZXJJZCkpIHtcblx0XHRcdHRoaXMuX3ZpZXdTdGF0ZUJ5U2Vzc2lvbi5zZXQoc2Vzc2lvblJlc291cmNlLCB7IC4uLnNhdmVkU3RhdGUsIGF1eGlsaWFyeUJhclZpc2libGU6IHRydWUgfSk7XG5cdFx0XHR2b2lkIHRoaXMuX3ZpZXdzU2VydmljZS5vcGVuVmlld0NvbnRhaW5lcihzYXZlZENvbnRhaW5lcklkLCBmYWxzZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGRlZmF1bHRDb250YWluZXJJZCA9IHRoaXMuX2RlZmF1bHRBdXhpbGlhcnlCYXJDb250YWluZXJJZCgpO1xuXHRcdFx0dGhpcy5fdmlld1N0YXRlQnlTZXNzaW9uLnNldChzZXNzaW9uUmVzb3VyY2UsIHtcblx0XHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSxcblx0XHRcdFx0YXV4aWxpYXJ5QmFyQWN0aXZlVmlld0NvbnRhaW5lcklkOiBkZWZhdWx0Q29udGFpbmVySWQsXG5cdFx0XHR9KTtcblx0XHRcdHZvaWQgdGhpcy5fb3BlbkRlZmF1bHRBdXhpbGlhcnlCYXJDb250YWluZXIoZGVmYXVsdENvbnRhaW5lcklkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogW0QyL0Q4XSBIaWRlIHRoZSBzaWRlIHBhbmUgYXMgcGFydCBvZiByZXN0b3JpbmcgYSBzZXNzaW9uJ3MgcmVtZW1iZXJlZFxuXHQgKiBzdGF0ZS4gVGhlIHN5bmNocm9ub3VzIGd1YXJkIG1ha2VzIHRoZSBbRDJdIGxpc3RlbmVyIGlnbm9yZSB0aGUgcmVzdWx0aW5nXG5cdCAqIHZpc2liaWxpdHkgY2hhbmdlIHNvIGEgcmVzdG9yZS1kcml2ZW4gaGlkZSBpcyBuZXZlciByZWNvcmRlZCBhcyBhIG5ld1xuXHQgKiBwZXItc2Vzc2lvbiBjaG9pY2UuXG5cdCAqL1xuXHRwcml2YXRlIF9oaWRlQXV4aWxpYXJ5QmFyRm9yUmVzdG9yZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9oaWRpbmdBdXhpbGlhcnlCYXJGb3JSZXN0b3JlID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKHRydWUsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faGlkaW5nQXV4aWxpYXJ5QmFyRm9yUmVzdG9yZSA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2lzQXV4aWxpYXJ5QmFyQ29udGFpbmVyUGlubmVkKGNvbnRhaW5lcklkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlXG5cdFx0XHQuZ2V0UGlubmVkUGFuZUNvbXBvc2l0ZUlkcyhWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKVxuXHRcdFx0LmluY2x1ZGVzKGNvbnRhaW5lcklkKTtcblx0fVxuXG5cdHByaXZhdGUgX2xvYWROZXdTZXNzaW9uVmlld1N0YXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IG5ld1Nlc3Npb25SYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoTkVXX1NFU1NJT05fVklFV19TVEFURV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGlmICghbmV3U2Vzc2lvblJhdykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShuZXdTZXNzaW9uUmF3KTtcblx0XHRcdGlmIChwYXJzZWQgJiYgdHlwZW9mIHBhcnNlZC5hdXhpbGlhcnlCYXJWaXNpYmxlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0dGhpcy5fbmV3U2Vzc2lvblZpZXdTdGF0ZSA9IHsgYXV4aWxpYXJ5QmFyVmlzaWJsZTogcGFyc2VkLmF1eGlsaWFyeUJhclZpc2libGUgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShORVdfU0VTU0lPTl9WSUVXX1NUQVRFX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUoTkVXX1NFU1NJT05fVklFV19TVEFURV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxTQUFTLFNBQVMsMkJBQTJCO0FBQ3RELFNBQVMsZUFBZTtBQUV4QixTQUFTLDZCQUE2QjtBQUN0QyxPQUFPLGFBQWE7QUFDcEIsU0FBUyxjQUFjLHFCQUFxQjtBQUM1QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGFBQWE7QUFDdEIsU0FBbUIseUJBQXlCO0FBQzVDLFNBQVMsMkJBQTJCLHVCQUF1QjtBQUMzRCxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDRCQUE0QjtBQVlyQyxNQUFNLDZCQUE2QjtBQU9uQyxNQUFNLHlCQUF5QjtBQUd4QixNQUFNLDZCQUE2QjtBQVduQyxNQUFNLHlCQUF5QixxQkFBcUI7QUFBQSxFQUFwRDtBQUFBO0FBV047QUFBQSxT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
