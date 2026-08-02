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
import { mainWindow } from "../../../../base/browser/window.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { isThenable, Sequencer } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { autorun, derived, derivedObservableWithCache, derivedOpts, observableFromEvent, runOnChange } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { URI } from "../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILifecycleService } from "../../../../workbench/services/lifecycle/common/lifecycle.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, MainEditorAreaVisibleContext } from "../../../../workbench/common/contextkeys.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../workbench/common/views.js";
import { IEditorGroupsService } from "../../../../workbench/services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { Parts } from "../../../../workbench/services/layout/browser/layoutService.js";
import { IPaneCompositePartService } from "../../../../workbench/services/panecomposite/browser/panecomposite.js";
import { IViewsService } from "../../../../workbench/services/views/common/viewsService.js";
import { IAgentWorkbenchLayoutService } from "../../../browser/workbench.js";
import { Menus } from "../../../browser/menus.js";
import { SessionsWelcomeVisibleContext, IsQuickChatSessionContext, CustomViewVisibleContext } from "../../../common/contextkeys.js";
import { logSidePanelToggle } from "../../../common/sessionsTelemetry.js";
import { ISessionChangesService } from "../../changes/browser/sessionChangesService.js";
import { IChangesViewService } from "../../changes/common/changesViewService.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { SessionStatus } from "../../../services/sessions/common/session.js";
const secondarySidebarToggleClosedIcon = registerIcon("agent-secondary-sidebar-toggle-closed", Codicon.layoutSidebarRightOff, localize("agentSecondarySidebarToggleClosedIcon", "Icon for the sessions secondary sidebar when closed."));
const secondarySidebarToggleOpenIcon = registerIcon("agent-secondary-sidebar-toggle-open", Codicon.layoutSidebarRight, localize("agentSecondarySidebarToggleOpenIcon", "Icon for the sessions secondary sidebar when open."));
const SESSION_LAYOUT_STATE_KEY = "sessions.layoutState";
const WORKING_SETS_STORAGE_KEY = "sessions.workingSets";
let BaseLayoutController = class extends Disposable {
  constructor(_layoutService, _sessionManagementService, _sessionsService, _viewsService, _paneCompositePartService, _storageService, _configurationService, _editorService, _editorGroupsService, _workspaceContextService, _sessionChangesService, _changesViewService, _viewDescriptorService, _contextKeyService, _instantiationService, _lifecycleService) {
    super();
    this._layoutService = _layoutService;
    this._sessionManagementService = _sessionManagementService;
    this._sessionsService = _sessionsService;
    this._viewsService = _viewsService;
    this._paneCompositePartService = _paneCompositePartService;
    this._storageService = _storageService;
    this._configurationService = _configurationService;
    this._editorService = _editorService;
    this._editorGroupsService = _editorGroupsService;
    this._workspaceContextService = _workspaceContextService;
    this._sessionChangesService = _sessionChangesService;
    this._changesViewService = _changesViewService;
    this._viewDescriptorService = _viewDescriptorService;
    this._contextKeyService = _contextKeyService;
    this._instantiationService = _instantiationService;
    this._lifecycleService = _lifecycleService;
    // [B3] Per-session state, keyed by session resource and persisted to storage.
    this._panelVisibilityBySession = new ResourceMap();
    this._viewStateBySession = new ResourceMap();
    this._workingSets = new ResourceMap();
    /**
     * [B2] Whether the editor part was hidden (e.g. the user closed the Side
     * Panel while keeping editors open) for a session, captured on switch-away so
     * restoring the session's working set does not force the editor part open.
     */
    this._editorPartHiddenBySession = new ResourceMap();
    this._workingSetSequencer = new Sequencer();
    /**
     * `> 0` while the controller is restoring a session's layout on a session
     * switch (editor working set and/or auxiliary bar). Subclasses can use this to
     * re-baseline responsive behaviour instead of reacting to the restore-driven
     * part-visibility changes (see the desktop controller's [D7] sidebar logic).
     */
    this._restoringSessionLayoutDepth = 0;
    /**
     * Fires when a session-switch layout restore fully settles (the restore depth
     * returns to 0, after the — possibly async — working-set apply and aux-bar
     * restore complete). Subclasses reconcile off this instead of reacting to the
     * transient part/editor changes *during* the restore, which race the settled
     * state (e.g. a new session's empty working set closing the docked tabs).
     */
    this._onDidEndSessionLayoutRestore = this._register(new Emitter());
    this.onDidEndSessionLayoutRestore = this._onDidEndSessionLayoutRestore.event;
    /**
     * [D9] `true` while {@link toggleSidePane} hides/shows the editor + auxiliary
     * bar together. The desktop controller's per-session aux-bar capture skips
     * this window, so toggling the whole side pane is never recorded as an
     * aux-bar choice.
     */
    this._togglingSidePane = false;
    this._loadState();
    this._register(this._storageService.onWillSaveState(() => this._saveState()));
    this.activeSessionResourceObs = derivedOpts({
      equalsFn: isEqual
    }, (reader) => {
      const activeSession = this._sessionsService.activeSession.read(reader);
      return activeSession?.resource;
    });
    this.multipleSessionsVisibleObs = derived((reader) => {
      return this._sessionsService.visibleSessions.read(reader).length > 1;
    });
    this._register(autorun((reader) => {
      const visibleSessions = this._sessionsService.visibleSessions.read(reader);
      if (visibleSessions.length <= 1) {
        return;
      }
      for (const session of visibleSessions) {
        if (!session) {
          continue;
        }
        this._viewStateBySession.delete(session.resource);
        this._panelVisibilityBySession.delete(session.resource);
      }
    }));
    this._register(autorun((reader) => {
      const activeSessionResource = this.activeSessionResourceObs.read(reader);
      if (this.multipleSessionsVisibleObs.read(reader)) {
        return;
      }
      this._syncPanelVisibility(activeSessionResource);
    }));
    this._register(this._layoutService.onDidChangePartVisibility((e) => {
      if (e.partId !== Parts.PANEL_PART) {
        return;
      }
      if (this.multipleSessionsVisibleObs.get() || this._isCustomViewVisible()) {
        return;
      }
      const activeSession = this._sessionsService.activeSession.get();
      if (activeSession) {
        this._panelVisibilityBySession.set(activeSession.resource, e.visible);
      }
    }));
    this._register(this._layoutService.onDidChangePartVisibility((e) => {
      if (e.partId !== Parts.EDITOR_PART || this._isRestoringSessionLayout) {
        return;
      }
      if (this.multipleSessionsVisibleObs.get() || this._isCustomViewVisible()) {
        return;
      }
      const activeSession = this._sessionsService.activeSession.get();
      if (activeSession) {
        this._editorPartHiddenBySession.set(activeSession.resource, !e.visible);
      }
    }));
    this._useModalConfigObs = observableConfigValue("workbench.editor.useModal", "all", this._configurationService);
    const workspaceFoldersObs = observableFromEvent(
      this._workspaceContextService.onDidChangeWorkspaceFolders,
      () => this._workspaceContextService.getWorkspace().folders
    );
    const activeSessionForWorkingSet = derivedObservableWithCache(this, (reader, lastValue) => {
      const workspaceFolders = workspaceFoldersObs.read(reader);
      const activeSession = this._sessionsService.activeSession.read(reader);
      const activeSessionWorkspaceUri = activeSession?.workspace.read(reader)?.folders[0]?.workingDirectory;
      if (activeSessionWorkspaceUri && !workspaceFolders.some((folder) => isEqual(folder.uri, activeSessionWorkspaceUri))) {
        return lastValue;
      }
      if (isEqual(activeSession?.resource, lastValue?.resource)) {
        return lastValue;
      }
      return activeSession;
    });
    this._register(runOnChange(this._sessionsService.activeSession, (session, previousSession) => {
      if (previousSession && !isEqual(previousSession.resource, session?.resource) && previousSession.status.read(void 0) !== SessionStatus.Untitled && !this._isRestoringSessionLayout) {
        this._saveWorkingSet(previousSession.resource);
      }
    }));
    this._register(runOnChange(activeSessionForWorkingSet, (session, previousSession) => {
      if (previousSession || session && this._workingSets.has(session.resource)) {
        this._withSessionLayoutRestore(() => this._applyWorkingSet(session?.resource, { isInitialRestore: !previousSession }));
      }
    }));
    this._register(this._sessionManagementService.onDidChangeSessions((e) => {
      const archivedSessions = e.changed.filter((session) => session.isArchived.read(void 0));
      for (const session of [...e.removed, ...archivedSessions]) {
        this._deleteWorkingSet(session.resource);
        this._viewStateBySession.delete(session.resource);
        this._editorPartHiddenBySession.delete(session.resource);
      }
    }));
    this._register(this._sessionManagementService.onDidReplaceSession(({ from, to }) => this._onSessionReplaced(from, to)));
    this._register(this._registerSidePaneToggleAction());
    this._registerViewStateManagement();
    this._registerAuxiliaryControllers();
  }
  get _isRestoringSessionLayout() {
    return this._restoringSessionLayoutDepth > 0;
  }
  /**
   * Storage key for this controller's per-session layout state. Overridable so a
   * sibling controller (e.g. single-pane) persists to a fresh key instead of
   * sharing the classic desktop state.
   */
  get _layoutStateStorageKey() {
    return SESSION_LAYOUT_STATE_KEY;
  }
  /**
   * Legacy key migrated on first load, or `undefined` to skip migration (a fresh
   * sibling controller has no legacy state to migrate).
   */
  get _legacyWorkingSetsStorageKey() {
    return WORKING_SETS_STORAGE_KEY;
  }
  /**
   * Hook for a layout controller to create and own its auxiliary controllers.
   * The base implementation does nothing.
   */
  _registerAuxiliaryControllers() {
  }
  /**
   * Whether a custom view currently replaces the sessions grid. The parts it
   * covers are force-hidden, so those transitions must not be captured as the
   * active session's layout preference.
   */
  _isCustomViewVisible() {
    return this._layoutService.isVisible(Parts.CUSTOM_VIEW_GRID_PART);
  }
  /**
   * Registers the `Toggle Side Panel` action (menu item, keybinding,
   * command-palette entry). The action delegates straight to `toggleSidePane()`,
   * so no command/service indirection is needed; the controller owns the toggle
   * behaviour and its memory.
   */
  _registerSidePaneToggleAction() {
    const that = this;
    return registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.agentToggleSidePanel",
          title: localize2("toggleSecondarySidebar", "Toggle Side Panel"),
          icon: secondarySidebarToggleClosedIcon,
          toggled: {
            condition: ContextKeyExpr.or(AuxiliaryBarVisibleContext, MainEditorAreaVisibleContext),
            icon: secondarySidebarToggleOpenIcon
          },
          metadata: {
            description: localize("openAndCloseSidePanel", "Open/Show and Close/Hide the Side Panel (editor area and auxiliary bar)")
          },
          category: Categories.View,
          f1: true,
          // A quick chat has no side pane (Round 20 hides the empty aux bar
          // and the chat is full-width), so toggling it is meaningless. A custom
          // view replaces the side pane entirely.
          precondition: ContextKeyExpr.and(IsQuickChatSessionContext.negate(), CustomViewVisibleContext.negate()),
          keybinding: {
            weight: KeybindingWeight.SessionsContrib,
            primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyB
          },
          menu: [
            {
              id: Menus.TitleBarSessionMenu,
              group: "navigation",
              order: 11,
              // After Open in VS Code (7), Run Script (8), and Open Terminal (10)
              when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated())
            }
          ]
        });
      }
      run(accessor) {
        const nowVisible = that.toggleSidePane();
        logSidePanelToggle(accessor.get(ITelemetryService), nowVisible);
        alert(nowVisible ? localize("sidePanelVisible", "Side Panel shown") : localize("sidePanelHidden", "Side Panel hidden"));
      }
    });
  }
  /**
   * Hook for subclasses to register platform-specific auxiliary bar
   * view-state management. Runs at the end of the base constructor. The base
   * implementation does nothing.
   */
  _registerViewStateManagement() {
  }
  _onSessionReplaced(from, to) {
    const activeSession = this._sessionsService.activeSession.get();
    const replacedSessionIsActive = isEqual(activeSession?.resource, from.resource) || isEqual(activeSession?.resource, to.resource);
    const editorPartHidden = this._editorPartHiddenBySession.get(from.resource) ?? (replacedSessionIsActive ? !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) : void 0);
    if (editorPartHidden !== void 0) {
      this._editorPartHiddenBySession.set(to.resource, editorPartHidden);
    }
  }
  /**
   * Whether the auxiliary bar currently has at least one active view container
   * (shown as a tab). Mirrors the workbench's own container-visibility rule
   * (`!hideIfEmpty || isViewContainerActive`, folded into `isViewContainerActive`).
   */
  _hasActiveAuxViewContainers() {
    return this._viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.AuxiliaryBar).some((container) => this._viewsService.isViewContainerActive(container.id));
  }
  /**
   * Toggle the **side pane** — the editor area together with the auxiliary bar.
   * Closing it hides both; re-opening restores exactly the parts that were
   * visible when it was last closed (defaulting to both). The whole operation
   * runs under {@link _togglingSidePane} so the desktop controller does not
   * record it as a per-session aux-bar choice ([D9]). Returns `true` if the
   * side pane is now visible.
   */
  toggleSidePane() {
    this._togglingSidePane = true;
    const suppressEditorPartAutoVisibility = this._layoutService.suppressEditorPartAutoVisibility();
    try {
      const editorVisible = this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow);
      const auxiliaryBarVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
      const isCurrentlyVisible = editorVisible || auxiliaryBarVisible;
      if (isCurrentlyVisible) {
        this._lastVisibleSidePaneParts = { editor: editorVisible, auxiliaryBar: auxiliaryBarVisible };
        this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
        this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
      } else {
        const restore = this._lastVisibleSidePaneParts ?? this._defaultReopenSidePaneParts();
        const hasEditors = this._editorGroupsService.groups.some((group) => !group.isEmpty);
        const hasAuxViewContainers = this._hasActiveAuxViewContainers();
        if (restore.editor && hasEditors) {
          this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
        }
        if (restore.auxiliaryBar && hasAuxViewContainers) {
          this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
        }
        if (!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) && !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
          if (hasEditors) {
            this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
          } else if (hasAuxViewContainers) {
            this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
          }
        }
      }
      this._onSidePaneToggled(isCurrentlyVisible, auxiliaryBarVisible);
      return !isCurrentlyVisible;
    } finally {
      suppressEditorPartAutoVisibility.dispose();
      this._togglingSidePane = false;
    }
  }
  /**
   * Hook invoked at the end of {@link toggleSidePane}, while
   * {@link _togglingSidePane} is still set, so subclasses can record the
   * resulting side-pane state (which the [D2] capture listener deliberately
   * ignores). `collapsed` is `true` when the toggle just hid the whole side
   * pane; `previousAuxiliaryBarVisible` is the aux bar's visibility before the
   * toggle. The base implementation does nothing.
   */
  _onSidePaneToggled(_collapsed, _previousAuxiliaryBarVisible) {
  }
  /**
   * The parts to reveal when re-opening the side pane with no remembered state
   * (e.g. after a reload). The base default shows both the editor and the
   * auxiliary bar; subclasses can specialize per layout / session type.
   */
  _defaultReopenSidePaneParts() {
    return { editor: true, auxiliaryBar: true };
  }
  /**
   * [B4] Hook that lets a subclass snapshot the active session's view state when
   * state is about to be persisted. The base implementation does nothing.
   */
  _captureActiveSessionViewState(_sessionResource) {
  }
  /**
   * Runs a session-switch layout restore with {@link _isRestoringSessionLayout}
   * held until the (possibly async) work settles, so part-visibility changes the
   * restore causes can be re-baselined rather than reacted to.
   */
  _withSessionLayoutRestore(work) {
    this._restoringSessionLayoutDepth++;
    const suppression = this._suppressEditorVisibilityDuringRestore();
    let settledSync = true;
    try {
      const result = work();
      if (isThenable(result)) {
        settledSync = false;
        Promise.resolve(result).catch(() => void 0).finally(() => {
          this._endSessionLayoutRestore(suppression);
        });
      }
    } finally {
      if (settledSync) {
        this._endSessionLayoutRestore(suppression);
      }
    }
  }
  _endSessionLayoutRestore(suppression) {
    this._restoringSessionLayoutDepth--;
    suppression?.dispose();
    if (this._restoringSessionLayoutDepth === 0) {
      this._onDidEndSessionLayoutRestore.fire();
    }
  }
  /**
   * Hook to suppress editor-part auto-visibility for the whole session-switch
   * restore. The base restore causes no layout-driven editor closes, so it
   * returns `undefined`.
   */
  _suppressEditorVisibilityDuringRestore() {
    return void 0;
  }
  /**
   * Hook deciding whether {@link _applyWorkingSet} reveals the editor part when
   * restoring a non-empty working set.
   */
  _shouldRevealEditorPartOnApply(editorPartHidden, isModal) {
    return !editorPartHidden && !isModal;
  }
  /**
   * Hook deciding whether {@link _applyWorkingSet} reveals the editor part for an
   * empty working set. The base never reveals in this case.
   */
  _shouldRevealEditorPartForEmptyWorkingSet(_revealEditorPart) {
    return false;
  }
  /**
   * Hook deciding whether {@link _applyWorkingSet} actively hides the editor part
   * when restoring a session that had it hidden. The base never hides (in the
   * classic layout the editor part visibility is not a per-session choice); the
   * single-pane layout restores its docked editor part both ways.
   */
  _shouldHideEditorPartOnApply(_editorPartHidden) {
    return false;
  }
  // --- Editor part reveal ---
  /**
   * Reveals the editor part. Editor working sets are restored into the shared
   * editor area on session switch, which requires the editor part to be visible.
   */
  _revealEditorPartForWorkingSet() {
    this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
  }
  /** Hides the editor part to restore a session that had its docked editor closed. */
  _hideEditorPartForWorkingSet() {
    this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
  }
  // --- Persistence [B3] ---
  _loadState() {
    const raw = this._storageService.get(this._layoutStateStorageKey, StorageScope.WORKSPACE);
    if (raw) {
      try {
        for (const entry of JSON.parse(raw)) {
          const resource = URI.parse(entry.sessionResource);
          if (entry.editorWorkingSet) {
            this._workingSets.set(resource, entry.editorWorkingSet);
          }
          if (entry.editorPartHidden !== void 0) {
            this._editorPartHiddenBySession.set(resource, entry.editorPartHidden);
          }
          if (entry.viewState) {
            this._viewStateBySession.set(resource, entry.viewState);
          }
        }
        return;
      } catch {
        this._storageService.remove(this._layoutStateStorageKey, StorageScope.WORKSPACE);
      }
    }
    const legacyKey = this._legacyWorkingSetsStorageKey;
    if (!legacyKey) {
      return;
    }
    const legacyRaw = this._storageService.get(legacyKey, StorageScope.WORKSPACE);
    if (legacyRaw) {
      try {
        for (const entry of JSON.parse(legacyRaw)) {
          const resource = URI.parse(entry.sessionResource);
          if (entry.editorWorkingSet) {
            this._workingSets.set(resource, entry.editorWorkingSet);
          }
          if (entry.auxiliaryBarState) {
            this._viewStateBySession.set(resource, {
              auxiliaryBarVisible: entry.auxiliaryBarState.visible,
              auxiliaryBarActiveViewContainerId: entry.auxiliaryBarState.activeViewContainerId
            });
          }
        }
      } catch {
      }
      this._storageService.remove(legacyKey, StorageScope.WORKSPACE);
    }
  }
  _saveState() {
    const activeSession = this._sessionsService.activeSession.get();
    const multipleVisible = this._sessionsService.visibleSessions.get().length > 1;
    if (activeSession && !multipleVisible && activeSession.status.read(void 0) !== SessionStatus.Untitled) {
      this._captureActiveSessionViewState(activeSession.resource);
    }
    if (activeSession && activeSession.status.read(void 0) !== SessionStatus.Untitled) {
      this._saveWorkingSet(activeSession.resource);
    }
    const allResources = new ResourceMap();
    this._workingSets.forEach((_, r) => allResources.set(r, true));
    this._viewStateBySession.forEach((_, r) => allResources.set(r, true));
    this._editorPartHiddenBySession.forEach((_, r) => allResources.set(r, true));
    if (allResources.size === 0) {
      this._storageService.remove(this._layoutStateStorageKey, StorageScope.WORKSPACE);
      return;
    }
    const entries = [];
    allResources.forEach((_, resource) => {
      entries.push({
        sessionResource: resource.toString(),
        editorWorkingSet: this._workingSets.get(resource),
        viewState: this._viewStateBySession.get(resource),
        editorPartHidden: this._editorPartHiddenBySession.get(resource)
      });
    });
    this._storageService.store(this._layoutStateStorageKey, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  // --- Panel [B1] ---
  _syncPanelVisibility(sessionResource) {
    if (!sessionResource) {
      this._layoutService.setPartHidden(true, Parts.PANEL_PART);
      return;
    }
    const wasVisible = this._panelVisibilityBySession.get(sessionResource);
    this._layoutService.setPartHidden(wasVisible !== true, Parts.PANEL_PART);
  }
  // --- Editor working sets [B2] ---
  async _applyWorkingSet(sessionResource, options) {
    const preserveFocus = true;
    const workingSet = sessionResource ? this._workingSets.get(sessionResource) ?? "empty" : "empty";
    return this._workingSetSequencer.queue(async () => {
      if (this._sessionsService.visibleSessions.get().length > 1) {
        const suppression = this._layoutService.suppressEditorPartAutoVisibility();
        try {
          await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
        } finally {
          suppression.dispose();
        }
        return;
      }
      const isModal = this._useModalConfigObs.get() === "all";
      const editorPartHidden = sessionResource ? this._editorPartHiddenBySession.get(sessionResource) === true : false;
      const revealEditorPart = !options?.isInitialRestore && this._shouldRevealEditorPartOnApply(editorPartHidden, isModal);
      const hideEditorPart = !options?.isInitialRestore && !revealEditorPart && this._shouldHideEditorPartOnApply(editorPartHidden);
      if (workingSet === "empty") {
        await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
        if (this._shouldRevealEditorPartForEmptyWorkingSet(revealEditorPart) && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
          this._revealEditorPartForWorkingSet();
        } else if (hideEditorPart && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
          this._hideEditorPartForWorkingSet();
        }
        return;
      }
      if (options?.isInitialRestore) {
        const suppression = this._layoutService.suppressEditorPartAutoVisibility();
        try {
          await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
        } finally {
          suppression.dispose();
        }
        if (this._shouldHideEditorPartOnApply(editorPartHidden) && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
          this._hideEditorPartForWorkingSet();
        }
        return;
      }
      if (revealEditorPart && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
        this._revealEditorPartForWorkingSet();
      } else if (hideEditorPart && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
        this._hideEditorPartForWorkingSet();
      }
      const result = await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
      if (revealEditorPart && result && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
        this._revealEditorPartForWorkingSet();
      } else if (hideEditorPart && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
        this._hideEditorPartForWorkingSet();
      }
    });
  }
  _saveWorkingSet(sessionResource) {
    this._deleteWorkingSet(sessionResource);
    if (this._editorService.visibleEditors.length > 0) {
      const workingSetName = `session-working-set:${sessionResource.toString()}`;
      const workingSet = this._editorGroupsService.saveWorkingSet(workingSetName);
      this._workingSets.set(sessionResource, workingSet);
    }
  }
  _deleteWorkingSet(sessionResource) {
    const existingWorkingSet = this._workingSets.get(sessionResource);
    if (!existingWorkingSet) {
      return;
    }
    this._editorGroupsService.deleteWorkingSet(existingWorkingSet);
    this._workingSets.delete(sessionResource);
  }
};
BaseLayoutController = __decorateClass([
  __decorateParam(0, IAgentWorkbenchLayoutService),
  __decorateParam(1, ISessionsManagementService),
  __decorateParam(2, ISessionsService),
  __decorateParam(3, IViewsService),
  __decorateParam(4, IPaneCompositePartService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IEditorGroupsService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, ISessionChangesService),
  __decorateParam(11, IChangesViewService),
  __decorateParam(12, IViewDescriptorService),
  __decorateParam(13, IContextKeyService),
  __decorateParam(14, IInstantiationService),
  __decorateParam(15, ILifecycleService)
], BaseLayoutController);
export {
  BaseLayoutController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvbGF5b3V0L2Jyb3dzZXIvYmFzZVNlc3Npb25MYXlvdXRDb250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IGlzVGhlbmFibGUsIFNlcXVlbmNlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlLCBkZXJpdmVkT3B0cywgb2JzZXJ2YWJsZUZyb21FdmVudCwgcnVuT25DaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29uZmlnVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IEF1eGlsaWFyeUJhclZpc2libGVDb250ZXh0LCBJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQsIE1haW5FZGl0b3JBcmVhVmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIElFZGl0b3JXb3JraW5nU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUGFydHMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93b3JrYmVuY2guanMnO1xuaW1wb3J0IHsgTWVudXMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL21lbnVzLmpzJztcbmltcG9ydCB7IFNlc3Npb25zV2VsY29tZVZpc2libGVDb250ZXh0LCBJc1F1aWNrQ2hhdFNlc3Npb25Db250ZXh0LCBDdXN0b21WaWV3VmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgbG9nU2lkZVBhbmVsVG9nZ2xlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25zVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElTZXNzaW9uQ2hhbmdlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGFuZ2VzL2Jyb3dzZXIvc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGFuZ2VzVmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGFuZ2VzL2NvbW1vbi9jaGFuZ2VzVmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24sIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5cbmNvbnN0IHNlY29uZGFyeVNpZGViYXJUb2dnbGVDbG9zZWRJY29uID0gcmVnaXN0ZXJJY29uKCdhZ2VudC1zZWNvbmRhcnktc2lkZWJhci10b2dnbGUtY2xvc2VkJywgQ29kaWNvbi5sYXlvdXRTaWRlYmFyUmlnaHRPZmYsIGxvY2FsaXplKCdhZ2VudFNlY29uZGFyeVNpZGViYXJUb2dnbGVDbG9zZWRJY29uJywgXCJJY29uIGZvciB0aGUgc2Vzc2lvbnMgc2Vjb25kYXJ5IHNpZGViYXIgd2hlbiBjbG9zZWQuXCIpKTtcbmNvbnN0IHNlY29uZGFyeVNpZGViYXJUb2dnbGVPcGVuSWNvbiA9IHJlZ2lzdGVySWNvbignYWdlbnQtc2Vjb25kYXJ5LXNpZGViYXItdG9nZ2xlLW9wZW4nLCBDb2RpY29uLmxheW91dFNpZGViYXJSaWdodCwgbG9jYWxpemUoJ2FnZW50U2Vjb25kYXJ5U2lkZWJhclRvZ2dsZU9wZW5JY29uJywgXCJJY29uIGZvciB0aGUgc2Vzc2lvbnMgc2Vjb25kYXJ5IHNpZGViYXIgd2hlbiBvcGVuLlwiKSk7XG5cbi8qKlxuICogUGVyLXNlc3Npb24gdmlldyBzdGF0ZTogYXV4aWxpYXJ5IGJhciB2aXNpYmlsaXR5IGFuZCBhY3RpdmUgdmlldyBjb250YWluZXIuXG4gKiBUcmVhdGVkIGFzIG9wYXF1ZSBwZXJzaXN0ZWQgZGF0YSBieSB0aGUgYmFzZSBjb250cm9sbGVyOyBvbmx5IHRoZSBkZXNrdG9wXG4gKiBjb250cm9sbGVyIGludGVycHJldHMgaXQgKHNlZSBgZGVza3RvcFNlc3Npb25MYXlvdXRDb250cm9sbGVyLm1kYCkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25WaWV3U3RhdGUge1xuXHRyZWFkb25seSBhdXhpbGlhcnlCYXJWaXNpYmxlOiBib29sZWFuO1xuXHRyZWFkb25seSBhdXhpbGlhcnlCYXJBY3RpdmVWaWV3Q29udGFpbmVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIFtEOV0gTWFya3MgYW4gYXV4LWJhciBoaWRlIGNhdXNlZCBvbmx5IGJ5IGNvbGxhcHNpbmcgdGhlIHdob2xlIHNpZGUgcGFuZS4gKi9cblx0cmVhZG9ubHkgYXV4aWxpYXJ5QmFySGlkZGVuQnlDb2xsYXBzZT86IGJvb2xlYW47XG59XG5cbi8qKlxuICogRnVsbCBwZXItc2Vzc2lvbiBsYXlvdXQgc3RhdGUgcGVyc2lzdGVkIHRvIHN0b3JhZ2UuXG4gKi9cbmludGVyZmFjZSBJU2Vzc2lvbkxheW91dEVudHJ5IHtcblx0cmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHZpZXdTdGF0ZT86IElTZXNzaW9uVmlld1N0YXRlO1xuXHRyZWFkb25seSBlZGl0b3JXb3JraW5nU2V0PzogSUVkaXRvcldvcmtpbmdTZXQ7XG5cdHJlYWRvbmx5IGVkaXRvclBhcnRIaWRkZW4/OiBib29sZWFuO1xufVxuXG4vKiogTmV3IHVuaWZpZWQgc3RvcmFnZSBrZXkgZm9yIGFsbCBwZXItc2Vzc2lvbiBsYXlvdXQgc3RhdGUuICovXG5jb25zdCBTRVNTSU9OX0xBWU9VVF9TVEFURV9LRVkgPSAnc2Vzc2lvbnMubGF5b3V0U3RhdGUnO1xuLyoqIExlZ2FjeSBrZXkgXHUyMDE0IHJlYWQgb24gc3RhcnR1cCBmb3IgbWlncmF0aW9uIG9ubHkuICovXG5jb25zdCBXT1JLSU5HX1NFVFNfU1RPUkFHRV9LRVkgPSAnc2Vzc2lvbnMud29ya2luZ1NldHMnO1xuXG4vKipcbiAqIFNoYXJlZCwgcGxhdGZvcm0tYWdub3N0aWMgcGVyLXNlc3Npb24gbGF5b3V0IHN0YXRlIG1hbmFnZW1lbnQuIFRoZSBiZWhhdmlvdXJcbiAqIHNwZWNpZmllZCBoZXJlIGlzIGVudW1lcmF0ZWQgYXMgcnVsZXMgKipCMS1CNSoqIGluXG4gKiBbYmFzZVNlc3Npb25MYXlvdXRDb250cm9sbGVyLm1kXSguL2Jhc2VTZXNzaW9uTGF5b3V0Q29udHJvbGxlci5tZCkuXG4gKlxuICogSXQgb3ducyB0aGUgcGFuZWwgdmlzaWJpbGl0eSwgZWRpdG9yIHdvcmtpbmcgc2V0cywgcGVyc2lzdGVuY2UsIGFuZCB0aGVcbiAqIG11bHRpLXNlc3Npb24gc3VwcHJlc3Npb24gdGhhdCBldmVyeSBsYXlvdXQgbmVlZHMuIEF1eGlsaWFyeSBiYXIgbWFuYWdlbWVudFxuICogaXMgcGxhdGZvcm0tc3BlY2lmaWMgYW5kIHN1cHBsaWVkIGJ5IHN1YmNsYXNzZXMgdGhyb3VnaFxuICoge0BsaW5rIF9yZWdpc3RlclZpZXdTdGF0ZU1hbmFnZW1lbnR9IChzZWUgdGhlIGRlc2t0b3AgLyBtb2JpbGUgY29udHJvbGxlcnMpLlxuICovXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQmFzZUxheW91dENvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHQvLyBbQjNdIFBlci1zZXNzaW9uIHN0YXRlLCBrZXllZCBieSBzZXNzaW9uIHJlc291cmNlIGFuZCBwZXJzaXN0ZWQgdG8gc3RvcmFnZS5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9wYW5lbFZpc2liaWxpdHlCeVNlc3Npb24gPSBuZXcgUmVzb3VyY2VNYXA8Ym9vbGVhbj4oKTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF92aWV3U3RhdGVCeVNlc3Npb24gPSBuZXcgUmVzb3VyY2VNYXA8SVNlc3Npb25WaWV3U3RhdGU+KCk7XG5cdHByb3RlY3RlZCByZWFkb25seSBfd29ya2luZ1NldHMgPSBuZXcgUmVzb3VyY2VNYXA8SUVkaXRvcldvcmtpbmdTZXQ+KCk7XG5cdC8qKlxuXHQgKiBbQjJdIFdoZXRoZXIgdGhlIGVkaXRvciBwYXJ0IHdhcyBoaWRkZW4gKGUuZy4gdGhlIHVzZXIgY2xvc2VkIHRoZSBTaWRlXG5cdCAqIFBhbmVsIHdoaWxlIGtlZXBpbmcgZWRpdG9ycyBvcGVuKSBmb3IgYSBzZXNzaW9uLCBjYXB0dXJlZCBvbiBzd2l0Y2gtYXdheSBzb1xuXHQgKiByZXN0b3JpbmcgdGhlIHNlc3Npb24ncyB3b3JraW5nIHNldCBkb2VzIG5vdCBmb3JjZSB0aGUgZWRpdG9yIHBhcnQgb3Blbi5cblx0ICovXG5cdHByb3RlY3RlZCByZWFkb25seSBfZWRpdG9yUGFydEhpZGRlbkJ5U2Vzc2lvbiA9IG5ldyBSZXNvdXJjZU1hcDxib29sZWFuPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93b3JraW5nU2V0U2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlcigpO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBhY3RpdmVTZXNzaW9uUmVzb3VyY2VPYnM7XG5cdHByb3RlY3RlZCByZWFkb25seSBtdWx0aXBsZVNlc3Npb25zVmlzaWJsZU9icztcblxuXHQvKipcblx0ICogYD4gMGAgd2hpbGUgdGhlIGNvbnRyb2xsZXIgaXMgcmVzdG9yaW5nIGEgc2Vzc2lvbidzIGxheW91dCBvbiBhIHNlc3Npb25cblx0ICogc3dpdGNoIChlZGl0b3Igd29ya2luZyBzZXQgYW5kL29yIGF1eGlsaWFyeSBiYXIpLiBTdWJjbGFzc2VzIGNhbiB1c2UgdGhpcyB0b1xuXHQgKiByZS1iYXNlbGluZSByZXNwb25zaXZlIGJlaGF2aW91ciBpbnN0ZWFkIG9mIHJlYWN0aW5nIHRvIHRoZSByZXN0b3JlLWRyaXZlblxuXHQgKiBwYXJ0LXZpc2liaWxpdHkgY2hhbmdlcyAoc2VlIHRoZSBkZXNrdG9wIGNvbnRyb2xsZXIncyBbRDddIHNpZGViYXIgbG9naWMpLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzdG9yaW5nU2Vzc2lvbkxheW91dERlcHRoID0gMDtcblxuXHRwcm90ZWN0ZWQgZ2V0IF9pc1Jlc3RvcmluZ1Nlc3Npb25MYXlvdXQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc3RvcmluZ1Nlc3Npb25MYXlvdXREZXB0aCA+IDA7XG5cdH1cblxuXHQvKipcblx0ICogRmlyZXMgd2hlbiBhIHNlc3Npb24tc3dpdGNoIGxheW91dCByZXN0b3JlIGZ1bGx5IHNldHRsZXMgKHRoZSByZXN0b3JlIGRlcHRoXG5cdCAqIHJldHVybnMgdG8gMCwgYWZ0ZXIgdGhlIFx1MjAxNCBwb3NzaWJseSBhc3luYyBcdTIwMTQgd29ya2luZy1zZXQgYXBwbHkgYW5kIGF1eC1iYXJcblx0ICogcmVzdG9yZSBjb21wbGV0ZSkuIFN1YmNsYXNzZXMgcmVjb25jaWxlIG9mZiB0aGlzIGluc3RlYWQgb2YgcmVhY3RpbmcgdG8gdGhlXG5cdCAqIHRyYW5zaWVudCBwYXJ0L2VkaXRvciBjaGFuZ2VzICpkdXJpbmcqIHRoZSByZXN0b3JlLCB3aGljaCByYWNlIHRoZSBzZXR0bGVkXG5cdCAqIHN0YXRlIChlLmcuIGEgbmV3IHNlc3Npb24ncyBlbXB0eSB3b3JraW5nIHNldCBjbG9zaW5nIHRoZSBkb2NrZWQgdGFicykuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEVuZFNlc3Npb25MYXlvdXRSZXN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByb3RlY3RlZCByZWFkb25seSBvbkRpZEVuZFNlc3Npb25MYXlvdXRSZXN0b3JlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkRW5kU2Vzc2lvbkxheW91dFJlc3RvcmUuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIFtEOV0gYHRydWVgIHdoaWxlIHtAbGluayB0b2dnbGVTaWRlUGFuZX0gaGlkZXMvc2hvd3MgdGhlIGVkaXRvciArIGF1eGlsaWFyeVxuXHQgKiBiYXIgdG9nZXRoZXIuIFRoZSBkZXNrdG9wIGNvbnRyb2xsZXIncyBwZXItc2Vzc2lvbiBhdXgtYmFyIGNhcHR1cmUgc2tpcHNcblx0ICogdGhpcyB3aW5kb3csIHNvIHRvZ2dsaW5nIHRoZSB3aG9sZSBzaWRlIHBhbmUgaXMgbmV2ZXIgcmVjb3JkZWQgYXMgYW5cblx0ICogYXV4LWJhciBjaG9pY2UuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX3RvZ2dsaW5nU2lkZVBhbmUgPSBmYWxzZTtcblxuXHQvKipcblx0ICogUmVtZW1iZXJzIHdoaWNoIHBhcnRzIHdlcmUgdmlzaWJsZSB3aGVuIHRoZSBzaWRlIHBhbmUgd2FzIGxhc3QgaGlkZGVuLCBzb1xuXHQgKiByZS1vcGVuaW5nIHJlc3RvcmVzIHRoZSBzYW1lIHBhcnRzIGluc3RlYWQgb2YgYWx3YXlzIHNob3dpbmcgYm90aC5cblx0ICovXG5cdHByaXZhdGUgX2xhc3RWaXNpYmxlU2lkZVBhbmVQYXJ0czogeyByZWFkb25seSBlZGl0b3I6IGJvb2xlYW47IHJlYWRvbmx5IGF1eGlsaWFyeUJhcjogYm9vbGVhbiB9IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3VzZU1vZGFsQ29uZmlnT2JzO1xuXG5cdC8qKlxuXHQgKiBTdG9yYWdlIGtleSBmb3IgdGhpcyBjb250cm9sbGVyJ3MgcGVyLXNlc3Npb24gbGF5b3V0IHN0YXRlLiBPdmVycmlkYWJsZSBzbyBhXG5cdCAqIHNpYmxpbmcgY29udHJvbGxlciAoZS5nLiBzaW5nbGUtcGFuZSkgcGVyc2lzdHMgdG8gYSBmcmVzaCBrZXkgaW5zdGVhZCBvZlxuXHQgKiBzaGFyaW5nIHRoZSBjbGFzc2ljIGRlc2t0b3Agc3RhdGUuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgZ2V0IF9sYXlvdXRTdGF0ZVN0b3JhZ2VLZXkoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gU0VTU0lPTl9MQVlPVVRfU1RBVEVfS0VZO1xuXHR9XG5cblx0LyoqXG5cdCAqIExlZ2FjeSBrZXkgbWlncmF0ZWQgb24gZmlyc3QgbG9hZCwgb3IgYHVuZGVmaW5lZGAgdG8gc2tpcCBtaWdyYXRpb24gKGEgZnJlc2hcblx0ICogc2libGluZyBjb250cm9sbGVyIGhhcyBubyBsZWdhY3kgc3RhdGUgdG8gbWlncmF0ZSkuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgZ2V0IF9sZWdhY3lXb3JraW5nU2V0c1N0b3JhZ2VLZXkoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gV09SS0lOR19TRVRTX1NUT1JBR0VfS0VZO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cblx0XHRASUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2xheW91dFNlcnZpY2U6IElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25NYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9zZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF92aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9wYW5lQ29tcG9zaXRlUGFydFNlcnZpY2U6IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfZWRpdG9yR3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlOiBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLFxuXHRcdEBJQ2hhbmdlc1ZpZXdTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY2hhbmdlc1ZpZXdTZXJ2aWNlOiBJQ2hhbmdlc1ZpZXdTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2xpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gW0IzXSBSZXN0b3JlIHBlcnNpc3RlZCBzdGF0ZSAod2l0aCBvbmUtdGltZSBsZWdhY3kgbWlncmF0aW9uKS5cblx0XHR0aGlzLl9sb2FkU3RhdGUoKTtcblxuXHRcdC8vIFtCNF0gUGVyc2lzdCBvbiBzaHV0ZG93bi5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKCkgPT4gdGhpcy5fc2F2ZVN0YXRlKCkpKTtcblxuXHRcdC8vIEFsbCBzZXNzaW9uLXN3aXRjaCBsb2dpYyBpcyBvYnNlcnZhYmxlLWRyaXZlbi5cblx0XHR0aGlzLmFjdGl2ZVNlc3Npb25SZXNvdXJjZU9icyA9IGRlcml2ZWRPcHRzPFVSSSB8IHVuZGVmaW5lZD4oe1xuXHRcdFx0ZXF1YWxzRm46IGlzRXF1YWxcblx0XHR9LCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBhY3RpdmVTZXNzaW9uPy5yZXNvdXJjZTtcblx0XHR9KTtcblxuXHRcdHRoaXMubXVsdGlwbGVTZXNzaW9uc1Zpc2libGVPYnMgPSBkZXJpdmVkPGJvb2xlYW4+KHJlYWRlciA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLnZpc2libGVTZXNzaW9ucy5yZWFkKHJlYWRlcikubGVuZ3RoID4gMTtcblx0XHR9KTtcblxuXHRcdC8vIFtCNV0gV2hlbiBtdWx0aXBsZSBzZXNzaW9ucyBhcmUgdmlzaWJsZSwgZHJvcCBwZXItc2Vzc2lvbiB2aWV3L3BhbmVsIHN0YXRlXG5cdFx0Ly8gZm9yIGVhY2ggdmlzaWJsZSBzZXNzaW9uIChlZGl0b3Igd29ya2luZyBzZXRzIGFyZSBwcmVzZXJ2ZWQpLiBUaGlzIGVuc3VyZXNcblx0XHQvLyB0aGUgZGVmYXVsdCB2aXNpYmlsaXR5IGxvZ2ljIHJ1bnMgYWdhaW4gYWZ0ZXIgY29sbGFwc2luZyBiYWNrIHRvIG9uZSBzZXNzaW9uLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHZpc2libGVTZXNzaW9ucyA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS52aXNpYmxlU2Vzc2lvbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHZpc2libGVTZXNzaW9ucy5sZW5ndGggPD0gMSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdmlzaWJsZVNlc3Npb25zKSB7XG5cdFx0XHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3ZpZXdTdGF0ZUJ5U2Vzc2lvbi5kZWxldGUoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX3BhbmVsVmlzaWJpbGl0eUJ5U2Vzc2lvbi5kZWxldGUoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gW0IxXSBTd2l0Y2ggYmV0d2VlbiBzZXNzaW9ucyBcdTIwMTQgc3luYyBwYW5lbCB2aXNpYmlsaXR5XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvblJlc291cmNlID0gdGhpcy5hY3RpdmVTZXNzaW9uUmVzb3VyY2VPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHRoaXMubXVsdGlwbGVTZXNzaW9uc1Zpc2libGVPYnMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3N5bmNQYW5lbFZpc2liaWxpdHkoYWN0aXZlU2Vzc2lvblJlc291cmNlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBbQjFdIFRyYWNrIHBhbmVsIHZpc2liaWxpdHkgY2hhbmdlcyBieSB0aGUgdXNlclxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xheW91dFNlcnZpY2Uub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eShlID0+IHtcblx0XHRcdGlmIChlLnBhcnRJZCAhPT0gUGFydHMuUEFORUxfUEFSVCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5tdWx0aXBsZVNlc3Npb25zVmlzaWJsZU9icy5nZXQoKSB8fCB0aGlzLl9pc0N1c3RvbVZpZXdWaXNpYmxlKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdFx0aWYgKGFjdGl2ZVNlc3Npb24pIHtcblx0XHRcdFx0dGhpcy5fcGFuZWxWaXNpYmlsaXR5QnlTZXNzaW9uLnNldChhY3RpdmVTZXNzaW9uLnJlc291cmNlLCBlLnZpc2libGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFtCMl0gVHJhY2sgZWRpdG9yLXBhcnQgKGRvY2tlZCBzaWRlLXBhbmUpIHZpc2liaWxpdHkgY2hhbmdlcyBieSB0aGUgdXNlclxuXHRcdC8vIHNvIGEgc2Vzc2lvbidzIGNsb3NlZC9vcGVuIGVkaXRvciBzdGF0ZSBpcyBjYXB0dXJlZCBhdCB0aGUgbW9tZW50IGl0XG5cdFx0Ly8gY2hhbmdlcyBcdTIwMTQgbm90IGxhemlseSByZS1yZWFkIGF0IHN3aXRjaC1hd2F5IHRpbWUsIHdoaWNoIHJhY2VzIHdpdGggdGhlXG5cdFx0Ly8gaW5jb21pbmcgc2Vzc2lvbidzIGFzeW5jIGxheW91dCByZXN0b3JlICh0aGUgc3dpdGNoIGRlcml2ZSBsYWdzIGJlaGluZFxuXHRcdC8vIHRoZSByYXcgYWN0aXZlLXNlc3Npb24gY2hhbmdlLCBzbyBieSB0aGUgdGltZSB0aGUgcHJldmlvdXMgc2Vzc2lvbiBpc1xuXHRcdC8vIHNhdmVkIHRoZSBlZGl0b3IgcGFydCBtYXkgYWxyZWFkeSByZWZsZWN0IHRoZSBuZXcgc2Vzc2lvbikuIFNraXBwZWRcblx0XHQvLyB3aGlsZSBtdWx0aXBsZSBzZXNzaW9ucyBhcmUgdmlzaWJsZSAodGhlIGVkaXRvciBhcmVhIGlzIHNoYXJlZCkgYW5kXG5cdFx0Ly8gZHVyaW5nIGEgc2Vzc2lvbi1zd2l0Y2ggcmVzdG9yZSAodGhvc2UgY2hhbmdlcyBhcmUgbGF5b3V0LWRyaXZlbiwgbm90XG5cdFx0Ly8gdXNlciBjaG9pY2VzKS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sYXlvdXRTZXJ2aWNlLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkoZSA9PiB7XG5cdFx0XHRpZiAoZS5wYXJ0SWQgIT09IFBhcnRzLkVESVRPUl9QQVJUIHx8IHRoaXMuX2lzUmVzdG9yaW5nU2Vzc2lvbkxheW91dCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5tdWx0aXBsZVNlc3Npb25zVmlzaWJsZU9icy5nZXQoKSB8fCB0aGlzLl9pc0N1c3RvbVZpZXdWaXNpYmxlKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdFx0aWYgKGFjdGl2ZVNlc3Npb24pIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yUGFydEhpZGRlbkJ5U2Vzc2lvbi5zZXQoYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZSwgIWUudmlzaWJsZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gW0IyXSBFZGl0b3Igd29ya2luZyBzZXRzXG5cblx0XHR0aGlzLl91c2VNb2RhbENvbmZpZ09icyA9IG9ic2VydmFibGVDb25maWdWYWx1ZTwnb2ZmJyB8ICdzb21lJyB8ICdhbGwnPignd29ya2JlbmNoLmVkaXRvci51c2VNb2RhbCcsICdhbGwnLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHQvLyBXb3Jrc3BhY2UgZm9sZGVycyBcdTIwMTQgdXNlZCB0byBkZWZlciBzZXNzaW9uIHN3aXRjaCB1bnRpbCB3b3Jrc3BhY2UgaXMgcmVhZHlcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzT2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudChcblx0XHRcdHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyxcblx0XHRcdCgpID0+IHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMpO1xuXG5cdFx0Ly8gW0IyXSBUaGUgYWN0aXZlIHNlc3Npb24gdXBkYXRlcyBiZWZvcmUgdGhlIHdvcmtzcGFjZSBmb2xkZXJzIGRvOyBob2xkIGJhY2tcblx0XHQvLyB0aGUgbmV3IHNlc3Npb24gdW50aWwgdGhlIGZvbGRlcnMgcmVmbGVjdCBpdHMgd29ya2luZyBkaXJlY3RvcnkuXG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbkZvcldvcmtpbmdTZXQgPSBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4odGhpcywgKHJlYWRlciwgbGFzdFZhbHVlKSA9PiB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gd29ya3NwYWNlRm9sZGVyc09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbldvcmtzcGFjZVVyaSA9IGFjdGl2ZVNlc3Npb24/LndvcmtzcGFjZS5yZWFkKHJlYWRlcik/LmZvbGRlcnNbMF0/LndvcmtpbmdEaXJlY3Rvcnk7XG5cblx0XHRcdGlmIChcblx0XHRcdFx0YWN0aXZlU2Vzc2lvbldvcmtzcGFjZVVyaSAmJlxuXHRcdFx0XHQhd29ya3NwYWNlRm9sZGVycy5zb21lKGZvbGRlciA9PiBpc0VxdWFsKGZvbGRlci51cmksIGFjdGl2ZVNlc3Npb25Xb3Jrc3BhY2VVcmkpKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybiBsYXN0VmFsdWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc0VxdWFsKGFjdGl2ZVNlc3Npb24/LnJlc291cmNlLCBsYXN0VmFsdWU/LnJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm4gbGFzdFZhbHVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gYWN0aXZlU2Vzc2lvbjtcblx0XHR9KTtcblxuXHRcdC8vIFdvcmtpbmcgc2V0cyBhcmUgYWx3YXlzIGFjdGl2ZTogYnJvd3NlciBlZGl0b3JzIGRvY2sgaW4gdGhlIHNoYXJlZCBncmlkXG5cdFx0Ly8gZWRpdG9yIHBhcnQgZXZlbiB3aGVuIGB3b3JrYmVuY2guZWRpdG9yLnVzZU1vZGFsYCBpcyBgJ2FsbCdgICh0aGV5XG5cdFx0Ly8gZGVsaWJlcmF0ZWx5IGV4Y2VwdCB0aGVtc2VsdmVzIGZyb20gdGhlIG1vZGFsIHBhcnQpLCBzbyB0aGVpciB0YWJzXG5cdFx0Ly8gc3RpbGwgbmVlZCB0byBiZSBjYXB0dXJlZC9yZXN0b3JlZCBwZXIgc2Vzc2lvbiBpbiB0aGF0IG1vZGUuXG5cblx0XHQvLyBbQjJdIFNhdmUgdGhlIG91dGdvaW5nIHNlc3Npb24ncyB3b3JraW5nIHNldCBlYWdlcmx5IG9uIHRoZSByYXcgYWN0aXZlXG5cdFx0Ly8gc2Vzc2lvbiBjaGFuZ2UsIG5vdCBvbiB0aGUgd29ya3NwYWNlLWdhdGVkIGBhY3RpdmVTZXNzaW9uRm9yV29ya2luZ1NldGBcblx0XHQvLyBkZXJpdmUgYmVsb3cuIFRoZSBkZXJpdmUgbGFncyB3aGlsZSB0aGUgaW5jb21pbmcgc2Vzc2lvbidzIHdvcmtzcGFjZVxuXHRcdC8vIHJlc29sdmVzLCBhbmQgYXV0b3J1bnMgZHJpdmVuIGJ5IHRoZSByYXcgYWN0aXZlIHNlc3Npb24gKGUuZy4gdGhlXG5cdFx0Ly8gc2luZ2xlLXBhbmUgbWFuYWdlZC10YWJzIHN5bmMpIGFzeW5jLWNsb3NlIHRoZSBvdXRnb2luZyBzZXNzaW9uJ3MgZG9ja2VkXG5cdFx0Ly8gZWRpdG9ycyBkdXJpbmcgdGhhdCB3aW5kb3cuIFNhdmluZyBoZXJlIHN5bmNocm9ub3VzbHkgXHUyMDE0IGJlZm9yZSB0aG9zZVxuXHRcdC8vIGNsb3NlcyBydW4gXHUyMDE0IGNhcHR1cmVzIHdoaWNoIGVkaXRvciB3YXMgYWN0aXZlIChlLmcuIHRoZSBDaGFuZ2VzIHRhYikgc28gaXRcblx0XHQvLyBpcyByZXN0b3JlZCBhY3RpdmUgb24gcmV0dXJuLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJ1bk9uQ2hhbmdlKHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLCAoc2Vzc2lvbiwgcHJldmlvdXNTZXNzaW9uKSA9PiB7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdHByZXZpb3VzU2Vzc2lvblxuXHRcdFx0XHQmJiAhaXNFcXVhbChwcmV2aW91c1Nlc3Npb24ucmVzb3VyY2UsIHNlc3Npb24/LnJlc291cmNlKVxuXHRcdFx0XHQmJiBwcmV2aW91c1Nlc3Npb24uc3RhdHVzLnJlYWQodW5kZWZpbmVkKSAhPT0gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZFxuXHRcdFx0XHQmJiAhdGhpcy5faXNSZXN0b3JpbmdTZXNzaW9uTGF5b3V0XG5cdFx0XHQpIHtcblx0XHRcdFx0dGhpcy5fc2F2ZVdvcmtpbmdTZXQocHJldmlvdXNTZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBbQjJdIFNlc3Npb24gY2hhbmdlZCAoYXBwbHkpXG5cdFx0dGhpcy5fcmVnaXN0ZXIocnVuT25DaGFuZ2UoYWN0aXZlU2Vzc2lvbkZvcldvcmtpbmdTZXQsIChzZXNzaW9uLCBwcmV2aW91c1Nlc3Npb24pID0+IHtcblx0XHRcdC8vIEFwcGx5IHdvcmtpbmcgc2V0IGZvciBjdXJyZW50IHNlc3Npb24uXG5cdFx0XHQvLyBPbiBpbml0aWFsIGxvYWQgKG5vIHByZXZpb3VzIHNlc3Npb24pLCBvbmx5IGFwcGx5IGlmIHdlIGhhdmUgYSBzYXZlZCB3b3JraW5nIHNldCBcdTIwMTRcblx0XHRcdC8vIHNraXAgYXBwbHlpbmcgJ2VtcHR5JyB0byBhdm9pZCBjbG9zaW5nIGVkaXRvcnMgdGhhdCBhcmUgYmVpbmcgcmVzdG9yZWQuXG5cdFx0XHRpZiAocHJldmlvdXNTZXNzaW9uIHx8IChzZXNzaW9uICYmIHRoaXMuX3dvcmtpbmdTZXRzLmhhcyhzZXNzaW9uLnJlc291cmNlKSkpIHtcblx0XHRcdFx0dGhpcy5fd2l0aFNlc3Npb25MYXlvdXRSZXN0b3JlKCgpID0+IHRoaXMuX2FwcGx5V29ya2luZ1NldChzZXNzaW9uPy5yZXNvdXJjZSwgeyBpc0luaXRpYWxSZXN0b3JlOiAhcHJldmlvdXNTZXNzaW9uIH0pKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBbQjJdIFNlc3Npb24gc3RhdGUgY2hhbmdlZCAoYXJjaGl2ZSwgZGVsZXRlKVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Nlc3Npb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4ge1xuXHRcdFx0Y29uc3QgYXJjaGl2ZWRTZXNzaW9ucyA9IGUuY2hhbmdlZC5maWx0ZXIoc2Vzc2lvbiA9PiBzZXNzaW9uLmlzQXJjaGl2ZWQucmVhZCh1bmRlZmluZWQpKTtcblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBbLi4uZS5yZW1vdmVkLCAuLi5hcmNoaXZlZFNlc3Npb25zXSkge1xuXHRcdFx0XHR0aGlzLl9kZWxldGVXb3JraW5nU2V0KHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0XHR0aGlzLl92aWV3U3RhdGVCeVNlc3Npb24uZGVsZXRlKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JQYXJ0SGlkZGVuQnlTZXNzaW9uLmRlbGV0ZShzZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2Vzc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkUmVwbGFjZVNlc3Npb24oKHsgZnJvbSwgdG8gfSkgPT4gdGhpcy5fb25TZXNzaW9uUmVwbGFjZWQoZnJvbSwgdG8pKSk7XG5cblx0XHQvLyBTaWRlLXBhbmUgdG9nZ2xlIFVJIChtZW51IGl0ZW0sIGtleWJpbmRpbmcsIGNvbW1hbmQtcGFsZXR0ZSBlbnRyeSkuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVnaXN0ZXJTaWRlUGFuZVRvZ2dsZUFjdGlvbigpKTtcblxuXHRcdC8vIFBsYXRmb3JtLXNwZWNpZmljIGF1eGlsaWFyeSBiYXIgLyB2aWV3LXN0YXRlIG1hbmFnZW1lbnQuXG5cdFx0dGhpcy5fcmVnaXN0ZXJWaWV3U3RhdGVNYW5hZ2VtZW50KCk7XG5cblx0XHQvLyBMYXlvdXQtc3BlY2lmaWMgYXV4aWxpYXJ5IGNvbnRyb2xsZXJzIChlLmcuIHNpbmdsZS1wYW5lIGRldGFpbC90YWJcblx0XHQvLyBjb250cm9sbGVycyksIGNyZWF0ZWQgYW5kIG93bmVkIGJ5IHRoZSBsYXlvdXQgY29udHJvbGxlciBzbyB0aGV5IHNoYXJlXG5cdFx0Ly8gaXRzIGxpZmVjeWNsZSBhbmQgY29vcmRpbmF0ZSB0aHJvdWdoIGl0LlxuXHRcdHRoaXMuX3JlZ2lzdGVyQXV4aWxpYXJ5Q29udHJvbGxlcnMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIb29rIGZvciBhIGxheW91dCBjb250cm9sbGVyIHRvIGNyZWF0ZSBhbmQgb3duIGl0cyBhdXhpbGlhcnkgY29udHJvbGxlcnMuXG5cdCAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIGRvZXMgbm90aGluZy5cblx0ICovXG5cdHByb3RlY3RlZCBfcmVnaXN0ZXJBdXhpbGlhcnlDb250cm9sbGVycygpOiB2b2lkIHsgfVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIGEgY3VzdG9tIHZpZXcgY3VycmVudGx5IHJlcGxhY2VzIHRoZSBzZXNzaW9ucyBncmlkLiBUaGUgcGFydHMgaXRcblx0ICogY292ZXJzIGFyZSBmb3JjZS1oaWRkZW4sIHNvIHRob3NlIHRyYW5zaXRpb25zIG11c3Qgbm90IGJlIGNhcHR1cmVkIGFzIHRoZVxuXHQgKiBhY3RpdmUgc2Vzc2lvbidzIGxheW91dCBwcmVmZXJlbmNlLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9pc0N1c3RvbVZpZXdWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5DVVNUT01fVklFV19HUklEX1BBUlQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVycyB0aGUgYFRvZ2dsZSBTaWRlIFBhbmVsYCBhY3Rpb24gKG1lbnUgaXRlbSwga2V5YmluZGluZyxcblx0ICogY29tbWFuZC1wYWxldHRlIGVudHJ5KS4gVGhlIGFjdGlvbiBkZWxlZ2F0ZXMgc3RyYWlnaHQgdG8gYHRvZ2dsZVNpZGVQYW5lKClgLFxuXHQgKiBzbyBubyBjb21tYW5kL3NlcnZpY2UgaW5kaXJlY3Rpb24gaXMgbmVlZGVkOyB0aGUgY29udHJvbGxlciBvd25zIHRoZSB0b2dnbGVcblx0ICogYmVoYXZpb3VyIGFuZCBpdHMgbWVtb3J5LlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVnaXN0ZXJTaWRlUGFuZVRvZ2dsZUFjdGlvbigpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0cmV0dXJuIHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRUb2dnbGVTaWRlUGFuZWwnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RvZ2dsZVNlY29uZGFyeVNpZGViYXInLCAnVG9nZ2xlIFNpZGUgUGFuZWwnKSxcblx0XHRcdFx0XHRpY29uOiBzZWNvbmRhcnlTaWRlYmFyVG9nZ2xlQ2xvc2VkSWNvbixcblx0XHRcdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdFx0XHRjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKEF1eGlsaWFyeUJhclZpc2libGVDb250ZXh0LCBNYWluRWRpdG9yQXJlYVZpc2libGVDb250ZXh0KSEsXG5cdFx0XHRcdFx0XHRpY29uOiBzZWNvbmRhcnlTaWRlYmFyVG9nZ2xlT3Blbkljb24sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdvcGVuQW5kQ2xvc2VTaWRlUGFuZWwnLCAnT3Blbi9TaG93IGFuZCBDbG9zZS9IaWRlIHRoZSBTaWRlIFBhbmVsIChlZGl0b3IgYXJlYSBhbmQgYXV4aWxpYXJ5IGJhciknKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0Ly8gQSBxdWljayBjaGF0IGhhcyBubyBzaWRlIHBhbmUgKFJvdW5kIDIwIGhpZGVzIHRoZSBlbXB0eSBhdXggYmFyXG5cdFx0XHRcdFx0Ly8gYW5kIHRoZSBjaGF0IGlzIGZ1bGwtd2lkdGgpLCBzbyB0b2dnbGluZyBpdCBpcyBtZWFuaW5nbGVzcy4gQSBjdXN0b21cblx0XHRcdFx0XHQvLyB2aWV3IHJlcGxhY2VzIHRoZSBzaWRlIHBhbmUgZW50aXJlbHkuXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoSXNRdWlja0NoYXRTZXNzaW9uQ29udGV4dC5uZWdhdGUoKSwgQ3VzdG9tVmlld1Zpc2libGVDb250ZXh0Lm5lZ2F0ZSgpKSxcblx0XHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliLFxuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlCXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRtZW51OiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlkOiBNZW51cy5UaXRsZUJhclNlc3Npb25NZW51LFxuXHRcdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0XHRvcmRlcjogMTEsIC8vIEFmdGVyIE9wZW4gaW4gVlMgQ29kZSAoNyksIFJ1biBTY3JpcHQgKDgpLCBhbmQgT3BlbiBUZXJtaW5hbCAoMTApXG5cdFx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQudG9OZWdhdGVkKCksIFNlc3Npb25zV2VsY29tZVZpc2libGVDb250ZXh0LnRvTmVnYXRlZCgpKVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0XHRjb25zdCBub3dWaXNpYmxlID0gdGhhdC50b2dnbGVTaWRlUGFuZSgpO1xuXG5cdFx0XHRcdGxvZ1NpZGVQYW5lbFRvZ2dsZShhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpLCBub3dWaXNpYmxlKTtcblxuXHRcdFx0XHQvLyBBbm5vdW5jZSB2aXNpYmlsaXR5IGNoYW5nZSB0byBzY3JlZW4gcmVhZGVyc1xuXHRcdFx0XHRhbGVydChub3dWaXNpYmxlXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnc2lkZVBhbmVsVmlzaWJsZScsIFwiU2lkZSBQYW5lbCBzaG93blwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ3NpZGVQYW5lbEhpZGRlbicsIFwiU2lkZSBQYW5lbCBoaWRkZW5cIikpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhvb2sgZm9yIHN1YmNsYXNzZXMgdG8gcmVnaXN0ZXIgcGxhdGZvcm0tc3BlY2lmaWMgYXV4aWxpYXJ5IGJhclxuXHQgKiB2aWV3LXN0YXRlIG1hbmFnZW1lbnQuIFJ1bnMgYXQgdGhlIGVuZCBvZiB0aGUgYmFzZSBjb25zdHJ1Y3Rvci4gVGhlIGJhc2Vcblx0ICogaW1wbGVtZW50YXRpb24gZG9lcyBub3RoaW5nLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9yZWdpc3RlclZpZXdTdGF0ZU1hbmFnZW1lbnQoKTogdm9pZCB7IH1cblxuXHRwcm90ZWN0ZWQgX29uU2Vzc2lvblJlcGxhY2VkKGZyb206IElTZXNzaW9uLCB0bzogSVNlc3Npb24pOiB2b2lkIHtcblx0XHQvLyBgb25EaWRSZXBsYWNlU2Vzc2lvbmAgZmlyZXMgb25seSB3aGVuIGFuIHVudGl0bGVkIGRyYWZ0IGlzIGF0b21pY2FsbHlcblx0XHQvLyByZXBsYWNlZCBieSBpdHMgY29tbWl0dGVkIHNlc3Npb24gb24gc3VibWl0LCBzbyBpdCBhbHdheXMgbWVhbnMgXCJ0aGVcblx0XHQvLyBjb21taXR0ZWQgc2Vzc2lvbiBpbmhlcml0cyB0aGUgZHJhZnQncyBvbi1zY3JlZW4gc2lkZS1wYW5lIGxheW91dFwiLlxuXHRcdC8vIFBlcnNpc3QgdGhlIGRyYWZ0J3MgbGl2ZSBlZGl0b3ItcGFydCB2aXNpYmlsaXR5IG9udG8gdGhlIGNvbW1pdHRlZFxuXHRcdC8vIHNlc3Npb24gc28gdGhlIGRlbGF5ZWQgd29ya2luZy1zZXQgYXBwbHkgcmVzdG9yZXMgaXQgYXMtbGVmdCAoaW5zdGVhZCBvZlxuXHRcdC8vIHRoZSBjcmVhdGVkLXNlc3Npb24gZGVmYXVsdCwgd2hpY2ggd291bGQgcmV2ZWFsIHRoZSBkb2NrZWQgZWRpdG9yKSBhbmQgaXRcblx0XHQvLyBhbHNvIHN1cnZpdmVzIGEgcmVsb2FkLlxuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRjb25zdCByZXBsYWNlZFNlc3Npb25Jc0FjdGl2ZSA9IGlzRXF1YWwoYWN0aXZlU2Vzc2lvbj8ucmVzb3VyY2UsIGZyb20ucmVzb3VyY2UpIHx8IGlzRXF1YWwoYWN0aXZlU2Vzc2lvbj8ucmVzb3VyY2UsIHRvLnJlc291cmNlKTtcblx0XHRjb25zdCBlZGl0b3JQYXJ0SGlkZGVuID0gdGhpcy5fZWRpdG9yUGFydEhpZGRlbkJ5U2Vzc2lvbi5nZXQoZnJvbS5yZXNvdXJjZSlcblx0XHRcdD8/IChyZXBsYWNlZFNlc3Npb25Jc0FjdGl2ZSA/ICF0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdykgOiB1bmRlZmluZWQpO1xuXHRcdGlmIChlZGl0b3JQYXJ0SGlkZGVuICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2VkaXRvclBhcnRIaWRkZW5CeVNlc3Npb24uc2V0KHRvLnJlc291cmNlLCBlZGl0b3JQYXJ0SGlkZGVuKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgYXV4aWxpYXJ5IGJhciBjdXJyZW50bHkgaGFzIGF0IGxlYXN0IG9uZSBhY3RpdmUgdmlldyBjb250YWluZXJcblx0ICogKHNob3duIGFzIGEgdGFiKS4gTWlycm9ycyB0aGUgd29ya2JlbmNoJ3Mgb3duIGNvbnRhaW5lci12aXNpYmlsaXR5IHJ1bGVcblx0ICogKGAhaGlkZUlmRW1wdHkgfHwgaXNWaWV3Q29udGFpbmVyQWN0aXZlYCwgZm9sZGVkIGludG8gYGlzVmlld0NvbnRhaW5lckFjdGl2ZWApLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9oYXNBY3RpdmVBdXhWaWV3Q29udGFpbmVycygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlld0Rlc2NyaXB0b3JTZXJ2aWNlXG5cdFx0XHQuZ2V0Vmlld0NvbnRhaW5lcnNCeUxvY2F0aW9uKFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpXG5cdFx0XHQuc29tZShjb250YWluZXIgPT4gdGhpcy5fdmlld3NTZXJ2aWNlLmlzVmlld0NvbnRhaW5lckFjdGl2ZShjb250YWluZXIuaWQpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUb2dnbGUgdGhlICoqc2lkZSBwYW5lKiogXHUyMDE0IHRoZSBlZGl0b3IgYXJlYSB0b2dldGhlciB3aXRoIHRoZSBhdXhpbGlhcnkgYmFyLlxuXHQgKiBDbG9zaW5nIGl0IGhpZGVzIGJvdGg7IHJlLW9wZW5pbmcgcmVzdG9yZXMgZXhhY3RseSB0aGUgcGFydHMgdGhhdCB3ZXJlXG5cdCAqIHZpc2libGUgd2hlbiBpdCB3YXMgbGFzdCBjbG9zZWQgKGRlZmF1bHRpbmcgdG8gYm90aCkuIFRoZSB3aG9sZSBvcGVyYXRpb25cblx0ICogcnVucyB1bmRlciB7QGxpbmsgX3RvZ2dsaW5nU2lkZVBhbmV9IHNvIHRoZSBkZXNrdG9wIGNvbnRyb2xsZXIgZG9lcyBub3Rcblx0ICogcmVjb3JkIGl0IGFzIGEgcGVyLXNlc3Npb24gYXV4LWJhciBjaG9pY2UgKFtEOV0pLiBSZXR1cm5zIGB0cnVlYCBpZiB0aGVcblx0ICogc2lkZSBwYW5lIGlzIG5vdyB2aXNpYmxlLlxuXHQgKi9cblx0dG9nZ2xlU2lkZVBhbmUoKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fdG9nZ2xpbmdTaWRlUGFuZSA9IHRydWU7XG5cdFx0Y29uc3Qgc3VwcHJlc3NFZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHkgPSB0aGlzLl9sYXlvdXRTZXJ2aWNlLnN1cHByZXNzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5KCk7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFRyZWF0IHRoZSBzaWRlIHBhbmUgYXMgdmlzaWJsZSB3aGVuICplaXRoZXIqIHBhcnQgaXMgdmlzaWJsZSBzbyB0aGVcblx0XHRcdC8vIHRvZ2dsZSBhbHdheXMgY2xvc2VzIGJvdGgsIGluc3RlYWQgb2YganVzdCByZXZlYWxpbmcgdGhlIGF1eGlsaWFyeVxuXHRcdFx0Ly8gYmFyIG9uIHRvcCBvZiBhbiBhbHJlYWR5LXZpc2libGUgZWRpdG9yIGFyZWEuXG5cdFx0XHRjb25zdCBlZGl0b3JWaXNpYmxlID0gdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpO1xuXHRcdFx0Y29uc3QgYXV4aWxpYXJ5QmFyVmlzaWJsZSA9IHRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKTtcblx0XHRcdGNvbnN0IGlzQ3VycmVudGx5VmlzaWJsZSA9IGVkaXRvclZpc2libGUgfHwgYXV4aWxpYXJ5QmFyVmlzaWJsZTtcblxuXHRcdFx0Ly8gV2hlbiBoaWRpbmcgYW5kIHVuaGlkaW5nIHRoZSBlZGl0b3IgcGFydCBhbmQgYXV4aWxpYXJ5IGJhciwgaGlkaW5nXG5cdFx0XHQvLyBtdXN0IGJlIGRvbmUgaW4gdGhlIG9wcG9zaXRlIG9yZGVyIHRoYW4gc2hvd2luZyBmb3Igc2l6aW5nIHRvIHJlc3RvcmVcblx0XHRcdC8vIGNvcnJlY3QgZGltZW5zaW9ucy5cblx0XHRcdGlmIChpc0N1cnJlbnRseVZpc2libGUpIHtcblx0XHRcdFx0dGhpcy5fbGFzdFZpc2libGVTaWRlUGFuZVBhcnRzID0geyBlZGl0b3I6IGVkaXRvclZpc2libGUsIGF1eGlsaWFyeUJhcjogYXV4aWxpYXJ5QmFyVmlzaWJsZSB9O1xuXHRcdFx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdFx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gUmVzdG9yZSBvbmx5IHRoZSBwYXJ0cyB0aGF0IHdlcmUgdmlzaWJsZSBiZWZvcmUgaGlkaW5nIChmYWxsaW5nIGJhY2tcblx0XHRcdFx0Ly8gdG8gdGhlIGxheW91dCdzIGRlZmF1bHQgcGFydHMgd2hlbiB0aGVyZSBpcyBubyByZW1lbWJlcmVkIHN0YXRlLFxuXHRcdFx0XHQvLyBlLmcuIGFmdGVyIGEgcmVsb2FkKS5cblx0XHRcdFx0Y29uc3QgcmVzdG9yZSA9IHRoaXMuX2xhc3RWaXNpYmxlU2lkZVBhbmVQYXJ0cyA/PyB0aGlzLl9kZWZhdWx0UmVvcGVuU2lkZVBhbmVQYXJ0cygpO1xuXHRcdFx0XHRjb25zdCBoYXNFZGl0b3JzID0gdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5ncm91cHMuc29tZShncm91cCA9PiAhZ3JvdXAuaXNFbXB0eSk7XG5cdFx0XHRcdGNvbnN0IGhhc0F1eFZpZXdDb250YWluZXJzID0gdGhpcy5faGFzQWN0aXZlQXV4Vmlld0NvbnRhaW5lcnMoKTtcblx0XHRcdFx0aWYgKHJlc3RvcmUuZWRpdG9yICYmIGhhc0VkaXRvcnMpIHtcblx0XHRcdFx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oZmFsc2UsIFBhcnRzLkVESVRPUl9QQVJUKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmVzdG9yZS5hdXhpbGlhcnlCYXIgJiYgaGFzQXV4Vmlld0NvbnRhaW5lcnMpIHtcblx0XHRcdFx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oZmFsc2UsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBFbnN1cmUgdGhlIHRvZ2dsZSBoYXMgYSB2aXNpYmxlIGVmZmVjdCwgYnV0IG5ldmVyIHJldmVhbCBhbiBlbXB0eVxuXHRcdFx0XHQvLyBhdXggYmFyOiBwcmVmZXIgdGhlIGVkaXRvciB3aGVuIGl0IGhhcyBjb250ZW50LCBlbHNlIHRoZSBhdXggYmFyXG5cdFx0XHRcdC8vIG9ubHkgd2hlbiBpdCBoYXMgYWN0aXZlIHZpZXcgY29udGFpbmVycyAoYSBxdWljayBjaGF0IHdpdGggbmVpdGhlclxuXHRcdFx0XHQvLyBoYXMgbm90aGluZyB0byByZXZlYWwpLlxuXHRcdFx0XHRpZiAoIXRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBtYWluV2luZG93KSAmJiAhdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpKSB7XG5cdFx0XHRcdFx0aWYgKGhhc0VkaXRvcnMpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihmYWxzZSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaGFzQXV4Vmlld0NvbnRhaW5lcnMpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihmYWxzZSwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBMZXQgc3ViY2xhc3NlcyByZWNvcmQgdGhlIHJlc3VsdGluZyBzaWRlLXBhbmUgc3RhdGUgKFtEMl0gY2FwdHVyZSBpcyBzdXBwcmVzc2VkIHdoaWxlIHRvZ2dsaW5nKS5cblx0XHRcdHRoaXMuX29uU2lkZVBhbmVUb2dnbGVkKGlzQ3VycmVudGx5VmlzaWJsZSwgYXV4aWxpYXJ5QmFyVmlzaWJsZSk7XG5cblx0XHRcdHJldHVybiAhaXNDdXJyZW50bHlWaXNpYmxlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzdXBwcmVzc0VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl90b2dnbGluZ1NpZGVQYW5lID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEhvb2sgaW52b2tlZCBhdCB0aGUgZW5kIG9mIHtAbGluayB0b2dnbGVTaWRlUGFuZX0sIHdoaWxlXG5cdCAqIHtAbGluayBfdG9nZ2xpbmdTaWRlUGFuZX0gaXMgc3RpbGwgc2V0LCBzbyBzdWJjbGFzc2VzIGNhbiByZWNvcmQgdGhlXG5cdCAqIHJlc3VsdGluZyBzaWRlLXBhbmUgc3RhdGUgKHdoaWNoIHRoZSBbRDJdIGNhcHR1cmUgbGlzdGVuZXIgZGVsaWJlcmF0ZWx5XG5cdCAqIGlnbm9yZXMpLiBgY29sbGFwc2VkYCBpcyBgdHJ1ZWAgd2hlbiB0aGUgdG9nZ2xlIGp1c3QgaGlkIHRoZSB3aG9sZSBzaWRlXG5cdCAqIHBhbmU7IGBwcmV2aW91c0F1eGlsaWFyeUJhclZpc2libGVgIGlzIHRoZSBhdXggYmFyJ3MgdmlzaWJpbGl0eSBiZWZvcmUgdGhlXG5cdCAqIHRvZ2dsZS4gVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gZG9lcyBub3RoaW5nLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9vblNpZGVQYW5lVG9nZ2xlZChfY29sbGFwc2VkOiBib29sZWFuLCBfcHJldmlvdXNBdXhpbGlhcnlCYXJWaXNpYmxlOiBib29sZWFuKTogdm9pZCB7IH1cblxuXHQvKipcblx0ICogVGhlIHBhcnRzIHRvIHJldmVhbCB3aGVuIHJlLW9wZW5pbmcgdGhlIHNpZGUgcGFuZSB3aXRoIG5vIHJlbWVtYmVyZWQgc3RhdGVcblx0ICogKGUuZy4gYWZ0ZXIgYSByZWxvYWQpLiBUaGUgYmFzZSBkZWZhdWx0IHNob3dzIGJvdGggdGhlIGVkaXRvciBhbmQgdGhlXG5cdCAqIGF1eGlsaWFyeSBiYXI7IHN1YmNsYXNzZXMgY2FuIHNwZWNpYWxpemUgcGVyIGxheW91dCAvIHNlc3Npb24gdHlwZS5cblx0ICovXG5cdHByb3RlY3RlZCBfZGVmYXVsdFJlb3BlblNpZGVQYW5lUGFydHMoKTogeyByZWFkb25seSBlZGl0b3I6IGJvb2xlYW47IHJlYWRvbmx5IGF1eGlsaWFyeUJhcjogYm9vbGVhbiB9IHtcblx0XHRyZXR1cm4geyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFtCNF0gSG9vayB0aGF0IGxldHMgYSBzdWJjbGFzcyBzbmFwc2hvdCB0aGUgYWN0aXZlIHNlc3Npb24ncyB2aWV3IHN0YXRlIHdoZW5cblx0ICogc3RhdGUgaXMgYWJvdXQgdG8gYmUgcGVyc2lzdGVkLiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBkb2VzIG5vdGhpbmcuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2NhcHR1cmVBY3RpdmVTZXNzaW9uVmlld1N0YXRlKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQgeyB9XG5cblx0LyoqXG5cdCAqIFJ1bnMgYSBzZXNzaW9uLXN3aXRjaCBsYXlvdXQgcmVzdG9yZSB3aXRoIHtAbGluayBfaXNSZXN0b3JpbmdTZXNzaW9uTGF5b3V0fVxuXHQgKiBoZWxkIHVudGlsIHRoZSAocG9zc2libHkgYXN5bmMpIHdvcmsgc2V0dGxlcywgc28gcGFydC12aXNpYmlsaXR5IGNoYW5nZXMgdGhlXG5cdCAqIHJlc3RvcmUgY2F1c2VzIGNhbiBiZSByZS1iYXNlbGluZWQgcmF0aGVyIHRoYW4gcmVhY3RlZCB0by5cblx0ICovXG5cdHByb3RlY3RlZCBfd2l0aFNlc3Npb25MYXlvdXRSZXN0b3JlKHdvcms6ICgpID0+IHZvaWQgfCBQcm9taXNlPHVua25vd24+KTogdm9pZCB7XG5cdFx0dGhpcy5fcmVzdG9yaW5nU2Vzc2lvbkxheW91dERlcHRoKys7XG5cdFx0Y29uc3Qgc3VwcHJlc3Npb24gPSB0aGlzLl9zdXBwcmVzc0VkaXRvclZpc2liaWxpdHlEdXJpbmdSZXN0b3JlKCk7XG5cdFx0bGV0IHNldHRsZWRTeW5jID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gd29yaygpO1xuXHRcdFx0aWYgKGlzVGhlbmFibGUocmVzdWx0KSkge1xuXHRcdFx0XHRzZXR0bGVkU3luYyA9IGZhbHNlO1xuXHRcdFx0XHRQcm9taXNlLnJlc29sdmUocmVzdWx0KS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2VuZFNlc3Npb25MYXlvdXRSZXN0b3JlKHN1cHByZXNzaW9uKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmIChzZXR0bGVkU3luYykge1xuXHRcdFx0XHR0aGlzLl9lbmRTZXNzaW9uTGF5b3V0UmVzdG9yZShzdXBwcmVzc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZW5kU2Vzc2lvbkxheW91dFJlc3RvcmUoc3VwcHJlc3Npb246IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVzdG9yaW5nU2Vzc2lvbkxheW91dERlcHRoLS07XG5cdFx0c3VwcHJlc3Npb24/LmRpc3Bvc2UoKTtcblx0XHRpZiAodGhpcy5fcmVzdG9yaW5nU2Vzc2lvbkxheW91dERlcHRoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9vbkRpZEVuZFNlc3Npb25MYXlvdXRSZXN0b3JlLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSG9vayB0byBzdXBwcmVzcyBlZGl0b3ItcGFydCBhdXRvLXZpc2liaWxpdHkgZm9yIHRoZSB3aG9sZSBzZXNzaW9uLXN3aXRjaFxuXHQgKiByZXN0b3JlLiBUaGUgYmFzZSByZXN0b3JlIGNhdXNlcyBubyBsYXlvdXQtZHJpdmVuIGVkaXRvciBjbG9zZXMsIHNvIGl0XG5cdCAqIHJldHVybnMgYHVuZGVmaW5lZGAuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX3N1cHByZXNzRWRpdG9yVmlzaWJpbGl0eUR1cmluZ1Jlc3RvcmUoKTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogSG9vayBkZWNpZGluZyB3aGV0aGVyIHtAbGluayBfYXBwbHlXb3JraW5nU2V0fSByZXZlYWxzIHRoZSBlZGl0b3IgcGFydCB3aGVuXG5cdCAqIHJlc3RvcmluZyBhIG5vbi1lbXB0eSB3b3JraW5nIHNldC5cblx0ICovXG5cdHByb3RlY3RlZCBfc2hvdWxkUmV2ZWFsRWRpdG9yUGFydE9uQXBwbHkoZWRpdG9yUGFydEhpZGRlbjogYm9vbGVhbiwgaXNNb2RhbDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhZWRpdG9yUGFydEhpZGRlbiAmJiAhaXNNb2RhbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBIb29rIGRlY2lkaW5nIHdoZXRoZXIge0BsaW5rIF9hcHBseVdvcmtpbmdTZXR9IHJldmVhbHMgdGhlIGVkaXRvciBwYXJ0IGZvciBhblxuXHQgKiBlbXB0eSB3b3JraW5nIHNldC4gVGhlIGJhc2UgbmV2ZXIgcmV2ZWFscyBpbiB0aGlzIGNhc2UuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX3Nob3VsZFJldmVhbEVkaXRvclBhcnRGb3JFbXB0eVdvcmtpbmdTZXQoX3JldmVhbEVkaXRvclBhcnQ6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogSG9vayBkZWNpZGluZyB3aGV0aGVyIHtAbGluayBfYXBwbHlXb3JraW5nU2V0fSBhY3RpdmVseSBoaWRlcyB0aGUgZWRpdG9yIHBhcnRcblx0ICogd2hlbiByZXN0b3JpbmcgYSBzZXNzaW9uIHRoYXQgaGFkIGl0IGhpZGRlbi4gVGhlIGJhc2UgbmV2ZXIgaGlkZXMgKGluIHRoZVxuXHQgKiBjbGFzc2ljIGxheW91dCB0aGUgZWRpdG9yIHBhcnQgdmlzaWJpbGl0eSBpcyBub3QgYSBwZXItc2Vzc2lvbiBjaG9pY2UpOyB0aGVcblx0ICogc2luZ2xlLXBhbmUgbGF5b3V0IHJlc3RvcmVzIGl0cyBkb2NrZWQgZWRpdG9yIHBhcnQgYm90aCB3YXlzLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9zaG91bGRIaWRlRWRpdG9yUGFydE9uQXBwbHkoX2VkaXRvclBhcnRIaWRkZW46IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyAtLS0gRWRpdG9yIHBhcnQgcmV2ZWFsIC0tLVxuXG5cdC8qKlxuXHQgKiBSZXZlYWxzIHRoZSBlZGl0b3IgcGFydC4gRWRpdG9yIHdvcmtpbmcgc2V0cyBhcmUgcmVzdG9yZWQgaW50byB0aGUgc2hhcmVkXG5cdCAqIGVkaXRvciBhcmVhIG9uIHNlc3Npb24gc3dpdGNoLCB3aGljaCByZXF1aXJlcyB0aGUgZWRpdG9yIHBhcnQgdG8gYmUgdmlzaWJsZS5cblx0ICovXG5cdHByaXZhdGUgX3JldmVhbEVkaXRvclBhcnRGb3JXb3JraW5nU2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2xheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihmYWxzZSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHR9XG5cblx0LyoqIEhpZGVzIHRoZSBlZGl0b3IgcGFydCB0byByZXN0b3JlIGEgc2Vzc2lvbiB0aGF0IGhhZCBpdHMgZG9ja2VkIGVkaXRvciBjbG9zZWQuICovXG5cdHByaXZhdGUgX2hpZGVFZGl0b3JQYXJ0Rm9yV29ya2luZ1NldCgpOiB2b2lkIHtcblx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHR9XG5cblx0Ly8gLS0tIFBlcnNpc3RlbmNlIFtCM10gLS0tXG5cblx0cHJpdmF0ZSBfbG9hZFN0YXRlKCk6IHZvaWQge1xuXHRcdC8vIExvYWQgZnJvbSBuZXcga2V5IGZpcnN0XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KHRoaXMuX2xheW91dFN0YXRlU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0aWYgKHJhdykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBKU09OLnBhcnNlKHJhdykgYXMgSVNlc3Npb25MYXlvdXRFbnRyeVtdKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoZW50cnkuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHRpZiAoZW50cnkuZWRpdG9yV29ya2luZ1NldCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fd29ya2luZ1NldHMuc2V0KHJlc291cmNlLCBlbnRyeS5lZGl0b3JXb3JraW5nU2V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGVudHJ5LmVkaXRvclBhcnRIaWRkZW4gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZWRpdG9yUGFydEhpZGRlbkJ5U2Vzc2lvbi5zZXQocmVzb3VyY2UsIGVudHJ5LmVkaXRvclBhcnRIaWRkZW4pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZW50cnkudmlld1N0YXRlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl92aWV3U3RhdGVCeVNlc3Npb24uc2V0KHJlc291cmNlLCBlbnRyeS52aWV3U3RhdGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gQ29ycnVwdGVkIGRhdGEgXHUyMDE0IHJlbW92ZSB0aGUgYmFkIGtleSBzbyB3ZSBkb24ndCBrZWVwIGZhaWxpbmcsIHRoZW4gZmFsbCB0aHJvdWdoIHRvIGxlZ2FjeSBtaWdyYXRpb25cblx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKHRoaXMuX2xheW91dFN0YXRlU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTWlncmF0ZSBmcm9tIGxlZ2FjeSBrZXkgKHNlc3Npb25zLndvcmtpbmdTZXRzKVxuXHRcdGNvbnN0IGxlZ2FjeUtleSA9IHRoaXMuX2xlZ2FjeVdvcmtpbmdTZXRzU3RvcmFnZUtleTtcblx0XHRpZiAoIWxlZ2FjeUtleSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsZWdhY3lSYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQobGVnYWN5S2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRpZiAobGVnYWN5UmF3KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0eXBlIExlZ2FjeUVudHJ5ID0geyBzZXNzaW9uUmVzb3VyY2U6IHN0cmluZzsgZWRpdG9yV29ya2luZ1NldD86IElFZGl0b3JXb3JraW5nU2V0OyBhdXhpbGlhcnlCYXJTdGF0ZT86IHsgdmlzaWJsZTogYm9vbGVhbjsgYWN0aXZlVmlld0NvbnRhaW5lcklkOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB9O1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIEpTT04ucGFyc2UobGVnYWN5UmF3KSBhcyBMZWdhY3lFbnRyeVtdKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoZW50cnkuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHRpZiAoZW50cnkuZWRpdG9yV29ya2luZ1NldCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fd29ya2luZ1NldHMuc2V0KHJlc291cmNlLCBlbnRyeS5lZGl0b3JXb3JraW5nU2V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGVudHJ5LmF1eGlsaWFyeUJhclN0YXRlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl92aWV3U3RhdGVCeVNlc3Npb24uc2V0KHJlc291cmNlLCB7XG5cdFx0XHRcdFx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGVudHJ5LmF1eGlsaWFyeUJhclN0YXRlLnZpc2libGUsXG5cdFx0XHRcdFx0XHRcdGF1eGlsaWFyeUJhckFjdGl2ZVZpZXdDb250YWluZXJJZDogZW50cnkuYXV4aWxpYXJ5QmFyU3RhdGUuYWN0aXZlVmlld0NvbnRhaW5lcklkLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gaWdub3JlIGNvcnJ1cHRlZCBkYXRhXG5cdFx0XHR9XG5cdFx0XHQvLyBSZW1vdmUgbGVnYWN5IGtleSBhZnRlciBtaWdyYXRpb25cblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShsZWdhY3lLZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0Y29uc3QgbXVsdGlwbGVWaXNpYmxlID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLnZpc2libGVTZXNzaW9ucy5nZXQoKS5sZW5ndGggPiAxO1xuXG5cdFx0Ly8gW0I0XSBDYXB0dXJlIGN1cnJlbnQgc3RhdGUgZm9yIHRoZSBhY3RpdmUgc2Vzc2lvbiAoc2tpcCBtdWx0aXBsZS12aXNpYmxlIGFuZCB1bnRpdGxlZCkuXG5cdFx0aWYgKGFjdGl2ZVNlc3Npb24gJiYgIW11bHRpcGxlVmlzaWJsZSAmJiBhY3RpdmVTZXNzaW9uLnN0YXR1cy5yZWFkKHVuZGVmaW5lZCkgIT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQpIHtcblx0XHRcdHRoaXMuX2NhcHR1cmVBY3RpdmVTZXNzaW9uVmlld1N0YXRlKGFjdGl2ZVNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdC8vIFtCNF0gQ2FwdHVyZSB3b3JraW5nIHNldCBmb3IgdGhlIGFjdGl2ZSBzZXNzaW9uIChza2lwIHVudGl0bGVkKVxuXHRcdGlmIChhY3RpdmVTZXNzaW9uICYmIGFjdGl2ZVNlc3Npb24uc3RhdHVzLnJlYWQodW5kZWZpbmVkKSAhPT0gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCkge1xuXHRcdFx0dGhpcy5fc2F2ZVdvcmtpbmdTZXQoYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29sbGVjdCBhbGwgc2Vzc2lvbiByZXNvdXJjZXMgYWNyb3NzIGFsbCBtYXBzXG5cdFx0Y29uc3QgYWxsUmVzb3VyY2VzID0gbmV3IFJlc291cmNlTWFwPHRydWU+KCk7XG5cdFx0dGhpcy5fd29ya2luZ1NldHMuZm9yRWFjaCgoXywgcikgPT4gYWxsUmVzb3VyY2VzLnNldChyLCB0cnVlKSk7XG5cdFx0dGhpcy5fdmlld1N0YXRlQnlTZXNzaW9uLmZvckVhY2goKF8sIHIpID0+IGFsbFJlc291cmNlcy5zZXQociwgdHJ1ZSkpO1xuXHRcdHRoaXMuX2VkaXRvclBhcnRIaWRkZW5CeVNlc3Npb24uZm9yRWFjaCgoXywgcikgPT4gYWxsUmVzb3VyY2VzLnNldChyLCB0cnVlKSk7XG5cblx0XHRpZiAoYWxsUmVzb3VyY2VzLnNpemUgPT09IDApIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZSh0aGlzLl9sYXlvdXRTdGF0ZVN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJpZXM6IElTZXNzaW9uTGF5b3V0RW50cnlbXSA9IFtdO1xuXHRcdGFsbFJlc291cmNlcy5mb3JFYWNoKChfLCByZXNvdXJjZSkgPT4ge1xuXHRcdFx0ZW50cmllcy5wdXNoKHtcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiByZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRlZGl0b3JXb3JraW5nU2V0OiB0aGlzLl93b3JraW5nU2V0cy5nZXQocmVzb3VyY2UpLFxuXHRcdFx0XHR2aWV3U3RhdGU6IHRoaXMuX3ZpZXdTdGF0ZUJ5U2Vzc2lvbi5nZXQocmVzb3VyY2UpLFxuXHRcdFx0XHRlZGl0b3JQYXJ0SGlkZGVuOiB0aGlzLl9lZGl0b3JQYXJ0SGlkZGVuQnlTZXNzaW9uLmdldChyZXNvdXJjZSksXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZSh0aGlzLl9sYXlvdXRTdGF0ZVN0b3JhZ2VLZXksIEpTT04uc3RyaW5naWZ5KGVudHJpZXMpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0Ly8gLS0tIFBhbmVsIFtCMV0gLS0tXG5cblx0cHJpdmF0ZSBfc3luY1BhbmVsVmlzaWJpbGl0eShzZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgUGFydHMuUEFORUxfUEFSVCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2FzVmlzaWJsZSA9IHRoaXMuX3BhbmVsVmlzaWJpbGl0eUJ5U2Vzc2lvbi5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHQvLyBEZWZhdWx0IHRvIGhpZGRlbiBpZiB3ZSBoYXZlIG5vIHJlY29yZCBmb3IgdGhpcyBzZXNzaW9uXG5cdFx0dGhpcy5fbGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKHdhc1Zpc2libGUgIT09IHRydWUsIFBhcnRzLlBBTkVMX1BBUlQpO1xuXHR9XG5cblx0Ly8gLS0tIEVkaXRvciB3b3JraW5nIHNldHMgW0IyXSAtLS1cblxuXHRwcml2YXRlIGFzeW5jIF9hcHBseVdvcmtpbmdTZXQoc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiB7IHJlYWRvbmx5IGlzSW5pdGlhbFJlc3RvcmU/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBSZXN0b3JpbmcgYSBzZXNzaW9uJ3MgZWRpdG9yIHdvcmtpbmcgc2V0IG11c3QgbmV2ZXIgcHVsbCBrZXlib2FyZCBmb2N1c1xuXHRcdC8vIGludG8gdGhlIGVkaXRvciBhcmVhLiBGb2N1cyBkdXJpbmcgYSBzZXNzaW9uIHN3aXRjaCBpcyBvd25lZCBieSB0aGVcblx0XHQvLyBzd2l0Y2ggaXRzZWxmIChpdCBtb3ZlcyBmb2N1cyBpbnRvIHRoZSBhY3RpdmUgc2Vzc2lvbidzIGNoYXQgaW5wdXQsIG9yXG5cdFx0Ly8gbGVhdmVzIGl0IG9uIHRoZSBwYW5lbCk7IGxldHRpbmcgdGhlIGVkaXRvciByZXN0b3JlIGdyYWIgZm9jdXMgd291bGRcblx0XHQvLyBzdGVhbCBpdCBmcm9tIHRoZSBjaGF0IGlucHV0IHdoZW5ldmVyIHRoZSB0YXJnZXQgc2Vzc2lvbiBoYXMgZWRpdG9yc1xuXHRcdC8vIG9wZW4uXG5cdFx0Y29uc3QgcHJlc2VydmVGb2N1cyA9IHRydWU7XG5cdFx0Y29uc3Qgd29ya2luZ1NldDogSUVkaXRvcldvcmtpbmdTZXQgfCAnZW1wdHknID0gc2Vzc2lvblJlc291cmNlXG5cdFx0XHQ/ICh0aGlzLl93b3JraW5nU2V0cy5nZXQoc2Vzc2lvblJlc291cmNlKSA/PyAnZW1wdHknKVxuXHRcdFx0OiAnZW1wdHknO1xuXG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtpbmdTZXRTZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gV2hlbiBtdWx0aXBsZSBzZXNzaW9ucyBhcmUgdmlzaWJsZSwgYXBwbHlpbmcgYSB3b3JraW5nIHNldCBtdXN0IG5ldmVyXG5cdFx0XHQvLyBjaGFuZ2UgdGhlIHZpc2liaWxpdHkgb2YgdGhlIGVkaXRvciBwYXJ0OiB0aGUgZWRpdG9yIGFyZWEgaXMgc2hhcmVkXG5cdFx0XHQvLyBhY3Jvc3MgdGhlIHZpc2libGUgc2Vzc2lvbnMgYW5kIGl0cyB2aXNpYmlsaXR5IGlzIGNvbnRyb2xsZWQgYnkgdGhlXG5cdFx0XHQvLyB1c2VyIChhbmQgYnkgZGlyZWN0IGVkaXRvciBvcGVuL2Nsb3NlIGV2ZW50cyBvdXRzaWRlIHRoaXMgcGF0aCkuXG5cdFx0XHRpZiAodGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLnZpc2libGVTZXNzaW9ucy5nZXQoKS5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGNvbnN0IHN1cHByZXNzaW9uID0gdGhpcy5fbGF5b3V0U2VydmljZS5zdXBwcmVzc0VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eSgpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuYXBwbHlXb3JraW5nU2V0KHdvcmtpbmdTZXQsIHsgcHJlc2VydmVGb2N1cyB9KTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRzdXBwcmVzc2lvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc01vZGFsID0gdGhpcy5fdXNlTW9kYWxDb25maWdPYnMuZ2V0KCkgPT09ICdhbGwnO1xuXHRcdFx0Ly8gVGhlIHVzZXIgbWF5IGhhdmUgaGlkZGVuIHRoZSBlZGl0b3IgcGFydCBmb3IgdGhpcyBzZXNzaW9uIChlLmcuIGJ5XG5cdFx0XHQvLyBjbG9zaW5nIHRoZSBTaWRlIFBhbmVsIHdoaWxlIGtlZXBpbmcgZWRpdG9ycyBvcGVuKS4gUmVzdG9yZSBpdCBhc1xuXHRcdFx0Ly8gbGVmdCBpbnN0ZWFkIG9mIGZvcmNpbmcgdGhlIGVkaXRvciBwYXJ0IGJhY2sgb3BlbiBvbiBzd2l0Y2guIEFcblx0XHRcdC8vIGRyYWZ0XHUyMTkyY29tbWl0dGVkIHN1Ym1pdCByZWNvcmRzIHRoZSBkcmFmdCdzIGVkaXRvci1wYXJ0IHZpc2liaWxpdHkgb250b1xuXHRcdFx0Ly8gdGhlIGNvbW1pdHRlZCBzZXNzaW9uIChzZWUgYF9vblNlc3Npb25SZXBsYWNlZGApLCBzbyB0aGlzIHJlc3RvcmVzIHRoZVxuXHRcdFx0Ly8gc3VibWl0dGVkIGxheW91dCB0b28uXG5cdFx0XHRjb25zdCBlZGl0b3JQYXJ0SGlkZGVuID0gc2Vzc2lvblJlc291cmNlID8gdGhpcy5fZWRpdG9yUGFydEhpZGRlbkJ5U2Vzc2lvbi5nZXQoc2Vzc2lvblJlc291cmNlKSA9PT0gdHJ1ZSA6IGZhbHNlO1xuXHRcdFx0Y29uc3QgcmV2ZWFsRWRpdG9yUGFydCA9ICFvcHRpb25zPy5pc0luaXRpYWxSZXN0b3JlXG5cdFx0XHRcdCYmIHRoaXMuX3Nob3VsZFJldmVhbEVkaXRvclBhcnRPbkFwcGx5KGVkaXRvclBhcnRIaWRkZW4sIGlzTW9kYWwpO1xuXHRcdFx0Ly8gUmVzdG9yZSBhIHNlc3Npb24gdGhhdCBoYWQgaXRzIChkb2NrZWQpIGVkaXRvciBwYXJ0IGNsb3NlZCBieSBhY3RpdmVseVxuXHRcdFx0Ly8gaGlkaW5nIGl0LCBzbyByZXR1cm5pbmcgZnJvbSBhIHNlc3Npb24gdGhhdCBoYWQgaXQgb3BlbiBkb2VzIG5vdCBsZWF2ZVxuXHRcdFx0Ly8gaXQgdmlzaWJsZS4gTXV0dWFsbHkgZXhjbHVzaXZlIHdpdGggcmV2ZWFsaW5nLlxuXHRcdFx0Y29uc3QgaGlkZUVkaXRvclBhcnQgPSAhb3B0aW9ucz8uaXNJbml0aWFsUmVzdG9yZVxuXHRcdFx0XHQmJiAhcmV2ZWFsRWRpdG9yUGFydFxuXHRcdFx0XHQmJiB0aGlzLl9zaG91bGRIaWRlRWRpdG9yUGFydE9uQXBwbHkoZWRpdG9yUGFydEhpZGRlbik7XG5cblx0XHRcdGlmICh3b3JraW5nU2V0ID09PSAnZW1wdHknKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuYXBwbHlXb3JraW5nU2V0KHdvcmtpbmdTZXQsIHsgcHJlc2VydmVGb2N1cyB9KTtcblx0XHRcdFx0aWYgKHRoaXMuX3Nob3VsZFJldmVhbEVkaXRvclBhcnRGb3JFbXB0eVdvcmtpbmdTZXQocmV2ZWFsRWRpdG9yUGFydCkgJiYgIXRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBtYWluV2luZG93KSkge1xuXHRcdFx0XHRcdHRoaXMuX3JldmVhbEVkaXRvclBhcnRGb3JXb3JraW5nU2V0KCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaGlkZUVkaXRvclBhcnQgJiYgdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpKSB7XG5cdFx0XHRcdFx0dGhpcy5faGlkZUVkaXRvclBhcnRGb3JXb3JraW5nU2V0KCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPbiB0aGUgaW5pdGlhbCByZXN0b3JlIGFmdGVyIGEgcmVsb2FkLCBwcmVzZXJ2ZSB0aGUgZWRpdG9yIHBhcnRcblx0XHRcdC8vIHZpc2liaWxpdHkgdGhhdCB0aGUgd29ya2JlbmNoIGFscmVhZHkgcmVzdG9yZWQuIFNpbmdsZS1wYW5lIGlzIHRoZVxuXHRcdFx0Ly8gZXhjZXB0aW9uOiBpdHMgcGVyLXNlc3Npb24gZWRpdG9yLXBhcnQgdmlzaWJpbGl0eSBpcyBhdXRob3JpdGF0aXZlIGFuZFxuXHRcdFx0Ly8gcGVyc2lzdGVkLCBzbyBhIERldGFpbC1vbmx5IChvciB3aG9sZS1zaWRlLXBhbmUtY2xvc2VkKSBzZXNzaW9uIG11c3QgYmVcblx0XHRcdC8vIHJlc3RvcmVkIHdpdGggaXRzIGVkaXRvciBoaWRkZW4gcmF0aGVyIHRoYW4gbGVmdCB2aXNpYmxlIGlmIHRoZVxuXHRcdFx0Ly8gd29ya2JlbmNoIChvciBhbiBpbml0LXRpbWUgd2lkdGggc3luYykgcmV2ZWFsZWQgaXQuIGBfc2hvdWxkSGlkZUVkaXRvclBhcnRPbkFwcGx5YFxuXHRcdFx0Ly8gcmV0dXJucyBgZmFsc2VgIGZvciB0aGUgY2xhc3NpYyBsYXlvdXQsIHNvIHRoaXMgaXMgYSBuby1vcCB0aGVyZS5cblx0XHRcdGlmIChvcHRpb25zPy5pc0luaXRpYWxSZXN0b3JlKSB7XG5cdFx0XHRcdGNvbnN0IHN1cHByZXNzaW9uID0gdGhpcy5fbGF5b3V0U2VydmljZS5zdXBwcmVzc0VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eSgpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuYXBwbHlXb3JraW5nU2V0KHdvcmtpbmdTZXQsIHsgcHJlc2VydmVGb2N1cyB9KTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRzdXBwcmVzc2lvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX3Nob3VsZEhpZGVFZGl0b3JQYXJ0T25BcHBseShlZGl0b3JQYXJ0SGlkZGVuKSAmJiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdykpIHtcblx0XHRcdFx0XHR0aGlzLl9oaWRlRWRpdG9yUGFydEZvcldvcmtpbmdTZXQoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXZlYWxFZGl0b3JQYXJ0ICYmICF0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdykpIHtcblx0XHRcdFx0dGhpcy5fcmV2ZWFsRWRpdG9yUGFydEZvcldvcmtpbmdTZXQoKTtcblx0XHRcdH0gZWxzZSBpZiAoaGlkZUVkaXRvclBhcnQgJiYgdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpKSB7XG5cdFx0XHRcdHRoaXMuX2hpZGVFZGl0b3JQYXJ0Rm9yV29ya2luZ1NldCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLmFwcGx5V29ya2luZ1NldCh3b3JraW5nU2V0LCB7IHByZXNlcnZlRm9jdXMgfSk7XG5cdFx0XHRpZiAocmV2ZWFsRWRpdG9yUGFydCAmJiByZXN1bHQgJiYgIXRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBtYWluV2luZG93KSkge1xuXHRcdFx0XHR0aGlzLl9yZXZlYWxFZGl0b3JQYXJ0Rm9yV29ya2luZ1NldCgpO1xuXHRcdFx0fSBlbHNlIGlmIChoaWRlRWRpdG9yUGFydCAmJiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdykpIHtcblx0XHRcdFx0dGhpcy5faGlkZUVkaXRvclBhcnRGb3JXb3JraW5nU2V0KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlV29ya2luZ1NldChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX2RlbGV0ZVdvcmtpbmdTZXQoc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdC8vIE5vdGU6IHRoZSBlZGl0b3IgcGFydCdzIGhpZGRlbiBzdGF0ZSBpcyBjYXB0dXJlZCBlYWdlcmx5IGJ5IHRoZSBbQjJdXG5cdFx0Ly8gcGFydC12aXNpYmlsaXR5IGxpc3RlbmVyIGF0IHRoZSBtb21lbnQgdGhlIHVzZXIgY2hhbmdlcyBpdCwgbm90IGhlcmUgXHUyMDE0XG5cdFx0Ly8gcmUtcmVhZGluZyBpdCBsYXppbHkgYXQgc3dpdGNoLWF3YXkgdGltZSByYWNlcyB3aXRoIHRoZSBpbmNvbWluZ1xuXHRcdC8vIHNlc3Npb24ncyBhc3luYyBsYXlvdXQgcmVzdG9yZSBhbmQgY291bGQgcmVjb3JkIHRoZSB3cm9uZyB2YWx1ZS5cblxuXHRcdGlmICh0aGlzLl9lZGl0b3JTZXJ2aWNlLnZpc2libGVFZGl0b3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHdvcmtpbmdTZXROYW1lID0gYHNlc3Npb24td29ya2luZy1zZXQ6JHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gO1xuXHRcdFx0Y29uc3Qgd29ya2luZ1NldCA9IHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2Uuc2F2ZVdvcmtpbmdTZXQod29ya2luZ1NldE5hbWUpO1xuXHRcdFx0dGhpcy5fd29ya2luZ1NldHMuc2V0KHNlc3Npb25SZXNvdXJjZSwgd29ya2luZ1NldCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGVsZXRlV29ya2luZ1NldChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGV4aXN0aW5nV29ya2luZ1NldCA9IHRoaXMuX3dvcmtpbmdTZXRzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghZXhpc3RpbmdXb3JraW5nU2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5kZWxldGVXb3JraW5nU2V0KGV4aXN0aW5nV29ya2luZ1NldCk7XG5cdFx0dGhpcy5fd29ya2luZ1NldHMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWSxpQkFBaUI7QUFDdEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxTQUFTLFNBQVMsNEJBQTRCLGFBQWEscUJBQXFCLG1CQUFtQjtBQUM1RyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBK0I7QUFDeEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQiwwQkFBMEI7QUFDbkQsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw0QkFBNEIsMEJBQTBCLG9DQUFvQztBQUNuRyxTQUFTLHdCQUF3Qiw2QkFBNkI7QUFDOUQsU0FBUyw0QkFBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsYUFBYTtBQUN0QixTQUFTLCtCQUErQiwyQkFBMkIsZ0NBQWdDO0FBQ25HLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQXlCLGtDQUFrQztBQUMzRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFtQixxQkFBcUI7QUFFeEMsTUFBTSxtQ0FBbUMsYUFBYSx5Q0FBeUMsUUFBUSx1QkFBdUIsU0FBUyx5Q0FBeUMsc0RBQXNELENBQUM7QUFDdk8sTUFBTSxpQ0FBaUMsYUFBYSx1Q0FBdUMsUUFBUSxvQkFBb0IsU0FBUyx1Q0FBdUMsb0RBQW9ELENBQUM7QUF5QjVOLE1BQU0sMkJBQTJCO0FBRWpDLE1BQU0sMkJBQTJCO0FBWTFCLElBQWUsdUJBQWYsY0FBNEMsV0FBVztBQUFBLEVBd0U3RCxZQUVrRCxnQkFDSiwyQkFDUixrQkFDSCxlQUNZLDJCQUNWLGlCQUNNLHVCQUNQLGdCQUNNLHNCQUNFLDBCQUNBLHdCQUNILHFCQUNHLHdCQUNKLG9CQUNHLHVCQUNKLG1CQUNyQztBQUNELFVBQU07QUFqQjJDO0FBQ0o7QUFDUjtBQUNIO0FBQ1k7QUFDVjtBQUNNO0FBQ1A7QUFDTTtBQUNFO0FBQ0E7QUFDSDtBQUNHO0FBQ0o7QUFDRztBQUNKO0FBdEZ2QztBQUFBLFNBQW1CLDRCQUE0QixJQUFJLFlBQXFCO0FBQ3hFLFNBQW1CLHNCQUFzQixJQUFJLFlBQStCO0FBQzVFLFNBQW1CLGVBQWUsSUFBSSxZQUErQjtBQU1yRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBbUIsNkJBQTZCLElBQUksWUFBcUI7QUFDekUsU0FBaUIsdUJBQXVCLElBQUksVUFBVTtBQVd0RDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFRLCtCQUErQjtBQWF2QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLGdDQUFnQyxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDbkYsU0FBbUIsK0JBQTRDLEtBQUssOEJBQThCO0FBUWxHO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVUsb0JBQW9CO0FBaUQ3QixTQUFLLFdBQVc7QUFHaEIsU0FBSyxVQUFVLEtBQUssZ0JBQWdCLGdCQUFnQixNQUFNLEtBQUssV0FBVyxDQUFDLENBQUM7QUFHNUUsU0FBSywyQkFBMkIsWUFBNkI7QUFBQSxNQUM1RCxVQUFVO0FBQUEsSUFDWCxHQUFHLFlBQVU7QUFDWixZQUFNLGdCQUFnQixLQUFLLGlCQUFpQixjQUFjLEtBQUssTUFBTTtBQUNyRSxhQUFPLGVBQWU7QUFBQSxJQUN2QixDQUFDO0FBRUQsU0FBSyw2QkFBNkIsUUFBaUIsWUFBVTtBQUM1RCxhQUFPLEtBQUssaUJBQWlCLGdCQUFnQixLQUFLLE1BQU0sRUFBRSxTQUFTO0FBQUEsSUFDcEUsQ0FBQztBQUtELFNBQUssVUFBVSxRQUFRLFlBQVU7QUFDaEMsWUFBTSxrQkFBa0IsS0FBSyxpQkFBaUIsZ0JBQWdCLEtBQUssTUFBTTtBQUN6RSxVQUFJLGdCQUFnQixVQUFVLEdBQUc7QUFDaEM7QUFBQSxNQUNEO0FBQ0EsaUJBQVcsV0FBVyxpQkFBaUI7QUFDdEMsWUFBSSxDQUFDLFNBQVM7QUFDYjtBQUFBLFFBQ0Q7QUFDQSxhQUFLLG9CQUFvQixPQUFPLFFBQVEsUUFBUTtBQUNoRCxhQUFLLDBCQUEwQixPQUFPLFFBQVEsUUFBUTtBQUFBLE1BQ3ZEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFHRixTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFlBQU0sd0JBQXdCLEtBQUsseUJBQXlCLEtBQUssTUFBTTtBQUN2RSxVQUFJLEtBQUssMkJBQTJCLEtBQUssTUFBTSxHQUFHO0FBQ2pEO0FBQUEsTUFDRDtBQUNBLFdBQUsscUJBQXFCLHFCQUFxQjtBQUFBLElBQ2hELENBQUMsQ0FBQztBQUdGLFNBQUssVUFBVSxLQUFLLGVBQWUsMEJBQTBCLE9BQUs7QUFDakUsVUFBSSxFQUFFLFdBQVcsTUFBTSxZQUFZO0FBQ2xDO0FBQUEsTUFDRDtBQUNBLFVBQUksS0FBSywyQkFBMkIsSUFBSSxLQUFLLEtBQUsscUJBQXFCLEdBQUc7QUFDekU7QUFBQSxNQUNEO0FBQ0EsWUFBTSxnQkFBZ0IsS0FBSyxpQkFBaUIsY0FBYyxJQUFJO0FBQzlELFVBQUksZUFBZTtBQUNsQixhQUFLLDBCQUEwQixJQUFJLGNBQWMsVUFBVSxFQUFFLE9BQU87QUFBQSxNQUNyRTtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBV0YsU0FBSyxVQUFVLEtBQUssZUFBZSwwQkFBMEIsT0FBSztBQUNqRSxVQUFJLEVBQUUsV0FBVyxNQUFNLGVBQWUsS0FBSywyQkFBMkI7QUFDckU7QUFBQSxNQUNEO0FBQ0EsVUFBSSxLQUFLLDJCQUEyQixJQUFJLEtBQUssS0FBSyxxQkFBcUIsR0FBRztBQUN6RTtBQUFBLE1BQ0Q7QUFDQSxZQUFNLGdCQUFnQixLQUFLLGlCQUFpQixjQUFjLElBQUk7QUFDOUQsVUFBSSxlQUFlO0FBQ2xCLGFBQUssMkJBQTJCLElBQUksY0FBYyxVQUFVLENBQUMsRUFBRSxPQUFPO0FBQUEsTUFDdkU7QUFBQSxJQUNELENBQUMsQ0FBQztBQUlGLFNBQUsscUJBQXFCLHNCQUE4Qyw2QkFBNkIsT0FBTyxLQUFLLHFCQUFxQjtBQUd0SSxVQUFNLHNCQUFzQjtBQUFBLE1BQzNCLEtBQUsseUJBQXlCO0FBQUEsTUFDOUIsTUFBTSxLQUFLLHlCQUF5QixhQUFhLEVBQUU7QUFBQSxJQUFPO0FBSTNELFVBQU0sNkJBQTZCLDJCQUF1RCxNQUFNLENBQUMsUUFBUSxjQUFjO0FBQ3RILFlBQU0sbUJBQW1CLG9CQUFvQixLQUFLLE1BQU07QUFDeEQsWUFBTSxnQkFBZ0IsS0FBSyxpQkFBaUIsY0FBYyxLQUFLLE1BQU07QUFDckUsWUFBTSw0QkFBNEIsZUFBZSxVQUFVLEtBQUssTUFBTSxHQUFHLFFBQVEsQ0FBQyxHQUFHO0FBRXJGLFVBQ0MsNkJBQ0EsQ0FBQyxpQkFBaUIsS0FBSyxZQUFVLFFBQVEsT0FBTyxLQUFLLHlCQUF5QixDQUFDLEdBQzlFO0FBQ0QsZUFBTztBQUFBLE1BQ1I7QUFFQSxVQUFJLFFBQVEsZUFBZSxVQUFVLFdBQVcsUUFBUSxHQUFHO0FBQzFELGVBQU87QUFBQSxNQUNSO0FBRUEsYUFBTztBQUFBLElBQ1IsQ0FBQztBQWVELFNBQUssVUFBVSxZQUFZLEtBQUssaUJBQWlCLGVBQWUsQ0FBQyxTQUFTLG9CQUFvQjtBQUM3RixVQUNDLG1CQUNHLENBQUMsUUFBUSxnQkFBZ0IsVUFBVSxTQUFTLFFBQVEsS0FDcEQsZ0JBQWdCLE9BQU8sS0FBSyxNQUFTLE1BQU0sY0FBYyxZQUN6RCxDQUFDLEtBQUssMkJBQ1I7QUFDRCxhQUFLLGdCQUFnQixnQkFBZ0IsUUFBUTtBQUFBLE1BQzlDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFHRixTQUFLLFVBQVUsWUFBWSw0QkFBNEIsQ0FBQyxTQUFTLG9CQUFvQjtBQUlwRixVQUFJLG1CQUFvQixXQUFXLEtBQUssYUFBYSxJQUFJLFFBQVEsUUFBUSxHQUFJO0FBQzVFLGFBQUssMEJBQTBCLE1BQU0sS0FBSyxpQkFBaUIsU0FBUyxVQUFVLEVBQUUsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUFBLE1BQ3RIO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFHRixTQUFLLFVBQVUsS0FBSywwQkFBMEIsb0JBQW9CLE9BQUs7QUFDdEUsWUFBTSxtQkFBbUIsRUFBRSxRQUFRLE9BQU8sYUFBVyxRQUFRLFdBQVcsS0FBSyxNQUFTLENBQUM7QUFDdkYsaUJBQVcsV0FBVyxDQUFDLEdBQUcsRUFBRSxTQUFTLEdBQUcsZ0JBQWdCLEdBQUc7QUFDMUQsYUFBSyxrQkFBa0IsUUFBUSxRQUFRO0FBQ3ZDLGFBQUssb0JBQW9CLE9BQU8sUUFBUSxRQUFRO0FBQ2hELGFBQUssMkJBQTJCLE9BQU8sUUFBUSxRQUFRO0FBQUEsTUFDeEQ7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxLQUFLLDBCQUEwQixvQkFBb0IsQ0FBQyxFQUFFLE1BQU0sR0FBRyxNQUFNLEtBQUssbUJBQW1CLE1BQU0sRUFBRSxDQUFDLENBQUM7QUFHdEgsU0FBSyxVQUFVLEtBQUssOEJBQThCLENBQUM7QUFHbkQsU0FBSyw2QkFBNkI7QUFLbEMsU0FBSyw4QkFBOEI7QUFBQSxFQUNwQztBQUFBLEVBek9BLElBQWMsNEJBQXFDO0FBQ2xELFdBQU8sS0FBSywrQkFBK0I7QUFBQSxFQUM1QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWlDQSxJQUFjLHlCQUFpQztBQUM5QyxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxJQUFjLCtCQUFtRDtBQUNoRSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFrTVUsZ0NBQXNDO0FBQUEsRUFBRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU94Qyx1QkFBZ0M7QUFDekMsV0FBTyxLQUFLLGVBQWUsVUFBVSxNQUFNLHFCQUFxQjtBQUFBLEVBQ2pFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRUSxnQ0FBNkM7QUFDcEQsVUFBTSxPQUFPO0FBQ2IsV0FBTyxnQkFBZ0IsY0FBYyxRQUFRO0FBQUEsTUFDNUMsY0FBYztBQUNiLGNBQU07QUFBQSxVQUNMLElBQUk7QUFBQSxVQUNKLE9BQU8sVUFBVSwwQkFBMEIsbUJBQW1CO0FBQUEsVUFDOUQsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFlBQ1IsV0FBVyxlQUFlLEdBQUcsNEJBQTRCLDRCQUE0QjtBQUFBLFlBQ3JGLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQSxVQUFVO0FBQUEsWUFDVCxhQUFhLFNBQVMseUJBQXlCLHlFQUF5RTtBQUFBLFVBQ3pIO0FBQUEsVUFDQSxVQUFVLFdBQVc7QUFBQSxVQUNyQixJQUFJO0FBQUE7QUFBQTtBQUFBO0FBQUEsVUFJSixjQUFjLGVBQWUsSUFBSSwwQkFBMEIsT0FBTyxHQUFHLHlCQUF5QixPQUFPLENBQUM7QUFBQSxVQUN0RyxZQUFZO0FBQUEsWUFDWCxRQUFRLGlCQUFpQjtBQUFBLFlBQ3pCLFNBQVMsT0FBTyxVQUFVLE9BQU8sTUFBTSxRQUFRO0FBQUEsVUFDaEQ7QUFBQSxVQUNBLE1BQU07QUFBQSxZQUNMO0FBQUEsY0FDQyxJQUFJLE1BQU07QUFBQSxjQUNWLE9BQU87QUFBQSxjQUNQLE9BQU87QUFBQTtBQUFBLGNBQ1AsTUFBTSxlQUFlLElBQUkseUJBQXlCLFVBQVUsR0FBRyw4QkFBOEIsVUFBVSxDQUFDO0FBQUEsWUFDekc7QUFBQSxVQUNEO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLE1BRUEsSUFBSSxVQUFrQztBQUNyQyxjQUFNLGFBQWEsS0FBSyxlQUFlO0FBRXZDLDJCQUFtQixTQUFTLElBQUksaUJBQWlCLEdBQUcsVUFBVTtBQUc5RCxjQUFNLGFBQ0gsU0FBUyxvQkFBb0Isa0JBQWtCLElBQy9DLFNBQVMsbUJBQW1CLG1CQUFtQixDQUFDO0FBQUEsTUFDcEQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT1UsK0JBQXFDO0FBQUEsRUFBRTtBQUFBLEVBRXZDLG1CQUFtQixNQUFnQixJQUFvQjtBQVFoRSxVQUFNLGdCQUFnQixLQUFLLGlCQUFpQixjQUFjLElBQUk7QUFDOUQsVUFBTSwwQkFBMEIsUUFBUSxlQUFlLFVBQVUsS0FBSyxRQUFRLEtBQUssUUFBUSxlQUFlLFVBQVUsR0FBRyxRQUFRO0FBQy9ILFVBQU0sbUJBQW1CLEtBQUssMkJBQTJCLElBQUksS0FBSyxRQUFRLE1BQ3JFLDBCQUEwQixDQUFDLEtBQUssZUFBZSxVQUFVLE1BQU0sYUFBYSxVQUFVLElBQUk7QUFDL0YsUUFBSSxxQkFBcUIsUUFBVztBQUNuQyxXQUFLLDJCQUEyQixJQUFJLEdBQUcsVUFBVSxnQkFBZ0I7QUFBQSxJQUNsRTtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPVSw4QkFBdUM7QUFDaEQsV0FBTyxLQUFLLHVCQUNWLDRCQUE0QixzQkFBc0IsWUFBWSxFQUM5RCxLQUFLLGVBQWEsS0FBSyxjQUFjLHNCQUFzQixVQUFVLEVBQUUsQ0FBQztBQUFBLEVBQzNFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVUEsaUJBQTBCO0FBQ3pCLFNBQUssb0JBQW9CO0FBQ3pCLFVBQU0sbUNBQW1DLEtBQUssZUFBZSxpQ0FBaUM7QUFDOUYsUUFBSTtBQUlILFlBQU0sZ0JBQWdCLEtBQUssZUFBZSxVQUFVLE1BQU0sYUFBYSxVQUFVO0FBQ2pGLFlBQU0sc0JBQXNCLEtBQUssZUFBZSxVQUFVLE1BQU0saUJBQWlCO0FBQ2pGLFlBQU0scUJBQXFCLGlCQUFpQjtBQUs1QyxVQUFJLG9CQUFvQjtBQUN2QixhQUFLLDRCQUE0QixFQUFFLFFBQVEsZUFBZSxjQUFjLG9CQUFvQjtBQUM1RixhQUFLLGVBQWUsY0FBYyxNQUFNLE1BQU0saUJBQWlCO0FBQy9ELGFBQUssZUFBZSxjQUFjLE1BQU0sTUFBTSxXQUFXO0FBQUEsTUFDMUQsT0FBTztBQUlOLGNBQU0sVUFBVSxLQUFLLDZCQUE2QixLQUFLLDRCQUE0QjtBQUNuRixjQUFNLGFBQWEsS0FBSyxxQkFBcUIsT0FBTyxLQUFLLFdBQVMsQ0FBQyxNQUFNLE9BQU87QUFDaEYsY0FBTSx1QkFBdUIsS0FBSyw0QkFBNEI7QUFDOUQsWUFBSSxRQUFRLFVBQVUsWUFBWTtBQUNqQyxlQUFLLGVBQWUsY0FBYyxPQUFPLE1BQU0sV0FBVztBQUFBLFFBQzNEO0FBQ0EsWUFBSSxRQUFRLGdCQUFnQixzQkFBc0I7QUFDakQsZUFBSyxlQUFlLGNBQWMsT0FBTyxNQUFNLGlCQUFpQjtBQUFBLFFBQ2pFO0FBS0EsWUFBSSxDQUFDLEtBQUssZUFBZSxVQUFVLE1BQU0sYUFBYSxVQUFVLEtBQUssQ0FBQyxLQUFLLGVBQWUsVUFBVSxNQUFNLGlCQUFpQixHQUFHO0FBQzdILGNBQUksWUFBWTtBQUNmLGlCQUFLLGVBQWUsY0FBYyxPQUFPLE1BQU0sV0FBVztBQUFBLFVBQzNELFdBQVcsc0JBQXNCO0FBQ2hDLGlCQUFLLGVBQWUsY0FBYyxPQUFPLE1BQU0saUJBQWlCO0FBQUEsVUFDakU7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUdBLFdBQUssbUJBQW1CLG9CQUFvQixtQkFBbUI7QUFFL0QsYUFBTyxDQUFDO0FBQUEsSUFDVCxVQUFFO0FBQ0QsdUNBQWlDLFFBQVE7QUFDekMsV0FBSyxvQkFBb0I7QUFBQSxJQUMxQjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFVVSxtQkFBbUIsWUFBcUIsOEJBQTZDO0FBQUEsRUFBRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU92Riw4QkFBNEY7QUFDckcsV0FBTyxFQUFFLFFBQVEsTUFBTSxjQUFjLEtBQUs7QUFBQSxFQUMzQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNVSwrQkFBK0Isa0JBQTZCO0FBQUEsRUFBRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU85RCwwQkFBMEIsTUFBMkM7QUFDOUUsU0FBSztBQUNMLFVBQU0sY0FBYyxLQUFLLHVDQUF1QztBQUNoRSxRQUFJLGNBQWM7QUFDbEIsUUFBSTtBQUNILFlBQU0sU0FBUyxLQUFLO0FBQ3BCLFVBQUksV0FBVyxNQUFNLEdBQUc7QUFDdkIsc0JBQWM7QUFDZCxnQkFBUSxRQUFRLE1BQU0sRUFBRSxNQUFNLE1BQU0sTUFBUyxFQUFFLFFBQVEsTUFBTTtBQUM1RCxlQUFLLHlCQUF5QixXQUFXO0FBQUEsUUFDMUMsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELFVBQUU7QUFDRCxVQUFJLGFBQWE7QUFDaEIsYUFBSyx5QkFBeUIsV0FBVztBQUFBLE1BQzFDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHlCQUF5QixhQUE0QztBQUM1RSxTQUFLO0FBQ0wsaUJBQWEsUUFBUTtBQUNyQixRQUFJLEtBQUssaUNBQWlDLEdBQUc7QUFDNUMsV0FBSyw4QkFBOEIsS0FBSztBQUFBLElBQ3pDO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9VLHlDQUFrRTtBQUMzRSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNVSwrQkFBK0Isa0JBQTJCLFNBQTJCO0FBQzlGLFdBQU8sQ0FBQyxvQkFBb0IsQ0FBQztBQUFBLEVBQzlCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1VLDBDQUEwQyxtQkFBcUM7QUFDeEYsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFVLDZCQUE2QixtQkFBcUM7QUFDM0UsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRUSxpQ0FBdUM7QUFDOUMsU0FBSyxlQUFlLGNBQWMsT0FBTyxNQUFNLFdBQVc7QUFBQSxFQUMzRDtBQUFBO0FBQUEsRUFHUSwrQkFBcUM7QUFDNUMsU0FBSyxlQUFlLGNBQWMsTUFBTSxNQUFNLFdBQVc7QUFBQSxFQUMxRDtBQUFBO0FBQUEsRUFJUSxhQUFtQjtBQUUxQixVQUFNLE1BQU0sS0FBSyxnQkFBZ0IsSUFBSSxLQUFLLHdCQUF3QixhQUFhLFNBQVM7QUFDeEYsUUFBSSxLQUFLO0FBQ1IsVUFBSTtBQUNILG1CQUFXLFNBQVMsS0FBSyxNQUFNLEdBQUcsR0FBNEI7QUFDN0QsZ0JBQU0sV0FBVyxJQUFJLE1BQU0sTUFBTSxlQUFlO0FBQ2hELGNBQUksTUFBTSxrQkFBa0I7QUFDM0IsaUJBQUssYUFBYSxJQUFJLFVBQVUsTUFBTSxnQkFBZ0I7QUFBQSxVQUN2RDtBQUNBLGNBQUksTUFBTSxxQkFBcUIsUUFBVztBQUN6QyxpQkFBSywyQkFBMkIsSUFBSSxVQUFVLE1BQU0sZ0JBQWdCO0FBQUEsVUFDckU7QUFDQSxjQUFJLE1BQU0sV0FBVztBQUNwQixpQkFBSyxvQkFBb0IsSUFBSSxVQUFVLE1BQU0sU0FBUztBQUFBLFVBQ3ZEO0FBQUEsUUFDRDtBQUNBO0FBQUEsTUFDRCxRQUFRO0FBRVAsYUFBSyxnQkFBZ0IsT0FBTyxLQUFLLHdCQUF3QixhQUFhLFNBQVM7QUFBQSxNQUNoRjtBQUFBLElBQ0Q7QUFHQSxVQUFNLFlBQVksS0FBSztBQUN2QixRQUFJLENBQUMsV0FBVztBQUNmO0FBQUEsSUFDRDtBQUNBLFVBQU0sWUFBWSxLQUFLLGdCQUFnQixJQUFJLFdBQVcsYUFBYSxTQUFTO0FBQzVFLFFBQUksV0FBVztBQUNkLFVBQUk7QUFFSCxtQkFBVyxTQUFTLEtBQUssTUFBTSxTQUFTLEdBQW9CO0FBQzNELGdCQUFNLFdBQVcsSUFBSSxNQUFNLE1BQU0sZUFBZTtBQUNoRCxjQUFJLE1BQU0sa0JBQWtCO0FBQzNCLGlCQUFLLGFBQWEsSUFBSSxVQUFVLE1BQU0sZ0JBQWdCO0FBQUEsVUFDdkQ7QUFDQSxjQUFJLE1BQU0sbUJBQW1CO0FBQzVCLGlCQUFLLG9CQUFvQixJQUFJLFVBQVU7QUFBQSxjQUN0QyxxQkFBcUIsTUFBTSxrQkFBa0I7QUFBQSxjQUM3QyxtQ0FBbUMsTUFBTSxrQkFBa0I7QUFBQSxZQUM1RCxDQUFDO0FBQUEsVUFDRjtBQUFBLFFBQ0Q7QUFBQSxNQUNELFFBQVE7QUFBQSxNQUVSO0FBRUEsV0FBSyxnQkFBZ0IsT0FBTyxXQUFXLGFBQWEsU0FBUztBQUFBLElBQzlEO0FBQUEsRUFDRDtBQUFBLEVBRVEsYUFBbUI7QUFDMUIsVUFBTSxnQkFBZ0IsS0FBSyxpQkFBaUIsY0FBYyxJQUFJO0FBQzlELFVBQU0sa0JBQWtCLEtBQUssaUJBQWlCLGdCQUFnQixJQUFJLEVBQUUsU0FBUztBQUc3RSxRQUFJLGlCQUFpQixDQUFDLG1CQUFtQixjQUFjLE9BQU8sS0FBSyxNQUFTLE1BQU0sY0FBYyxVQUFVO0FBQ3pHLFdBQUssK0JBQStCLGNBQWMsUUFBUTtBQUFBLElBQzNEO0FBR0EsUUFBSSxpQkFBaUIsY0FBYyxPQUFPLEtBQUssTUFBUyxNQUFNLGNBQWMsVUFBVTtBQUNyRixXQUFLLGdCQUFnQixjQUFjLFFBQVE7QUFBQSxJQUM1QztBQUdBLFVBQU0sZUFBZSxJQUFJLFlBQWtCO0FBQzNDLFNBQUssYUFBYSxRQUFRLENBQUMsR0FBRyxNQUFNLGFBQWEsSUFBSSxHQUFHLElBQUksQ0FBQztBQUM3RCxTQUFLLG9CQUFvQixRQUFRLENBQUMsR0FBRyxNQUFNLGFBQWEsSUFBSSxHQUFHLElBQUksQ0FBQztBQUNwRSxTQUFLLDJCQUEyQixRQUFRLENBQUMsR0FBRyxNQUFNLGFBQWEsSUFBSSxHQUFHLElBQUksQ0FBQztBQUUzRSxRQUFJLGFBQWEsU0FBUyxHQUFHO0FBQzVCLFdBQUssZ0JBQWdCLE9BQU8sS0FBSyx3QkFBd0IsYUFBYSxTQUFTO0FBQy9FO0FBQUEsSUFDRDtBQUVBLFVBQU0sVUFBaUMsQ0FBQztBQUN4QyxpQkFBYSxRQUFRLENBQUMsR0FBRyxhQUFhO0FBQ3JDLGNBQVEsS0FBSztBQUFBLFFBQ1osaUJBQWlCLFNBQVMsU0FBUztBQUFBLFFBQ25DLGtCQUFrQixLQUFLLGFBQWEsSUFBSSxRQUFRO0FBQUEsUUFDaEQsV0FBVyxLQUFLLG9CQUFvQixJQUFJLFFBQVE7QUFBQSxRQUNoRCxrQkFBa0IsS0FBSywyQkFBMkIsSUFBSSxRQUFRO0FBQUEsTUFDL0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELFNBQUssZ0JBQWdCLE1BQU0sS0FBSyx3QkFBd0IsS0FBSyxVQUFVLE9BQU8sR0FBRyxhQUFhLFdBQVcsY0FBYyxPQUFPO0FBQUEsRUFDL0g7QUFBQTtBQUFBLEVBSVEscUJBQXFCLGlCQUF3QztBQUNwRSxRQUFJLENBQUMsaUJBQWlCO0FBQ3JCLFdBQUssZUFBZSxjQUFjLE1BQU0sTUFBTSxVQUFVO0FBQ3hEO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBYSxLQUFLLDBCQUEwQixJQUFJLGVBQWU7QUFFckUsU0FBSyxlQUFlLGNBQWMsZUFBZSxNQUFNLE1BQU0sVUFBVTtBQUFBLEVBQ3hFO0FBQUE7QUFBQSxFQUlBLE1BQWMsaUJBQWlCLGlCQUFrQyxTQUFrRTtBQU9sSSxVQUFNLGdCQUFnQjtBQUN0QixVQUFNLGFBQTBDLGtCQUM1QyxLQUFLLGFBQWEsSUFBSSxlQUFlLEtBQUssVUFDM0M7QUFFSCxXQUFPLEtBQUsscUJBQXFCLE1BQU0sWUFBWTtBQUtsRCxVQUFJLEtBQUssaUJBQWlCLGdCQUFnQixJQUFJLEVBQUUsU0FBUyxHQUFHO0FBQzNELGNBQU0sY0FBYyxLQUFLLGVBQWUsaUNBQWlDO0FBQ3pFLFlBQUk7QUFDSCxnQkFBTSxLQUFLLHFCQUFxQixnQkFBZ0IsWUFBWSxFQUFFLGNBQWMsQ0FBQztBQUFBLFFBQzlFLFVBQUU7QUFDRCxzQkFBWSxRQUFRO0FBQUEsUUFDckI7QUFDQTtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFVBQVUsS0FBSyxtQkFBbUIsSUFBSSxNQUFNO0FBT2xELFlBQU0sbUJBQW1CLGtCQUFrQixLQUFLLDJCQUEyQixJQUFJLGVBQWUsTUFBTSxPQUFPO0FBQzNHLFlBQU0sbUJBQW1CLENBQUMsU0FBUyxvQkFDL0IsS0FBSywrQkFBK0Isa0JBQWtCLE9BQU87QUFJakUsWUFBTSxpQkFBaUIsQ0FBQyxTQUFTLG9CQUM3QixDQUFDLG9CQUNELEtBQUssNkJBQTZCLGdCQUFnQjtBQUV0RCxVQUFJLGVBQWUsU0FBUztBQUMzQixjQUFNLEtBQUsscUJBQXFCLGdCQUFnQixZQUFZLEVBQUUsY0FBYyxDQUFDO0FBQzdFLFlBQUksS0FBSywwQ0FBMEMsZ0JBQWdCLEtBQUssQ0FBQyxLQUFLLGVBQWUsVUFBVSxNQUFNLGFBQWEsVUFBVSxHQUFHO0FBQ3RJLGVBQUssK0JBQStCO0FBQUEsUUFDckMsV0FBVyxrQkFBa0IsS0FBSyxlQUFlLFVBQVUsTUFBTSxhQUFhLFVBQVUsR0FBRztBQUMxRixlQUFLLDZCQUE2QjtBQUFBLFFBQ25DO0FBQ0E7QUFBQSxNQUNEO0FBU0EsVUFBSSxTQUFTLGtCQUFrQjtBQUM5QixjQUFNLGNBQWMsS0FBSyxlQUFlLGlDQUFpQztBQUN6RSxZQUFJO0FBQ0gsZ0JBQU0sS0FBSyxxQkFBcUIsZ0JBQWdCLFlBQVksRUFBRSxjQUFjLENBQUM7QUFBQSxRQUM5RSxVQUFFO0FBQ0Qsc0JBQVksUUFBUTtBQUFBLFFBQ3JCO0FBQ0EsWUFBSSxLQUFLLDZCQUE2QixnQkFBZ0IsS0FBSyxLQUFLLGVBQWUsVUFBVSxNQUFNLGFBQWEsVUFBVSxHQUFHO0FBQ3hILGVBQUssNkJBQTZCO0FBQUEsUUFDbkM7QUFDQTtBQUFBLE1BQ0Q7QUFFQSxVQUFJLG9CQUFvQixDQUFDLEtBQUssZUFBZSxVQUFVLE1BQU0sYUFBYSxVQUFVLEdBQUc7QUFDdEYsYUFBSywrQkFBK0I7QUFBQSxNQUNyQyxXQUFXLGtCQUFrQixLQUFLLGVBQWUsVUFBVSxNQUFNLGFBQWEsVUFBVSxHQUFHO0FBQzFGLGFBQUssNkJBQTZCO0FBQUEsTUFDbkM7QUFFQSxZQUFNLFNBQVMsTUFBTSxLQUFLLHFCQUFxQixnQkFBZ0IsWUFBWSxFQUFFLGNBQWMsQ0FBQztBQUM1RixVQUFJLG9CQUFvQixVQUFVLENBQUMsS0FBSyxlQUFlLFVBQVUsTUFBTSxhQUFhLFVBQVUsR0FBRztBQUNoRyxhQUFLLCtCQUErQjtBQUFBLE1BQ3JDLFdBQVcsa0JBQWtCLEtBQUssZUFBZSxVQUFVLE1BQU0sYUFBYSxVQUFVLEdBQUc7QUFDMUYsYUFBSyw2QkFBNkI7QUFBQSxNQUNuQztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLGdCQUFnQixpQkFBNEI7QUFDbkQsU0FBSyxrQkFBa0IsZUFBZTtBQU90QyxRQUFJLEtBQUssZUFBZSxlQUFlLFNBQVMsR0FBRztBQUNsRCxZQUFNLGlCQUFpQix1QkFBdUIsZ0JBQWdCLFNBQVMsQ0FBQztBQUN4RSxZQUFNLGFBQWEsS0FBSyxxQkFBcUIsZUFBZSxjQUFjO0FBQzFFLFdBQUssYUFBYSxJQUFJLGlCQUFpQixVQUFVO0FBQUEsSUFDbEQ7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQkFBa0IsaUJBQTRCO0FBQ3JELFVBQU0scUJBQXFCLEtBQUssYUFBYSxJQUFJLGVBQWU7QUFDaEUsUUFBSSxDQUFDLG9CQUFvQjtBQUN4QjtBQUFBLElBQ0Q7QUFFQSxTQUFLLHFCQUFxQixpQkFBaUIsa0JBQWtCO0FBQzdELFNBQUssYUFBYSxPQUFPLGVBQWU7QUFBQSxFQUN6QztBQUNEO0FBbHZCc0IsdUJBQWY7QUFBQSxFQTBFSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBekZtQjsiLAogICJuYW1lcyI6IFtdCn0K
