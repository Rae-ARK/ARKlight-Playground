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
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived } from "../../../../base/common/observable.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { AGENT_HOST_SCHEME, fromAgentHostUri } from "../../../../platform/agentHost/common/agentHostUri.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { getWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { IAgentHostTerminalService } from "../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js";
import { ITerminalService } from "../../../../workbench/contrib/terminal/browser/terminal.js";
import { TerminalCapability } from "../../../../platform/terminal/common/capabilities/capabilities.js";
import { IPathService } from "../../../../workbench/services/path/common/pathService.js";
import { Menus } from "../../../browser/menus.js";
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from "../../../common/agentHostSessionsProvider.js";
import { SessionsWelcomeVisibleContext, IsPhoneLayoutContext, CustomViewVisibleContext } from "../../../common/contextkeys.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { ISessionsProvidersService } from "../../../services/sessions/browser/sessionsProvidersService.js";
import { IsAuxiliaryWindowContext } from "../../../../workbench/common/contextkeys.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { logSessionsInteraction } from "../../../common/sessionsTelemetry.js";
import { IViewsService } from "../../../../workbench/services/views/common/viewsService.js";
import { ITerminalProfileService, TERMINAL_VIEW_ID } from "../../../../workbench/contrib/terminal/common/terminal.js";
import { IWorkbenchLayoutService, Parts } from "../../../../workbench/services/layout/browser/layoutService.js";
import { ISessionTaskRunnerRegistry } from "../../chat/browser/sessionTaskRunner.js";
import { AgentHostSessionTaskRunner } from "./agentHostSessionTaskRunner.js";
const SessionsTerminalViewVisibleContext = new RawContextKey("sessionsTerminalViewVisible", false);
function getSessionTerminalInfo(session, reader) {
  if (!session) {
    return void 0;
  }
  const workspace = reader ? session.workspace.read(reader) : session.workspace.get();
  if (workspace?.isVirtualWorkspace !== false) {
    return void 0;
  }
  const folder = workspace.folders[0];
  const cwd = folder?.workingDirectory;
  if (!cwd) {
    return void 0;
  }
  if (cwd.scheme === AGENT_HOST_SCHEME) {
    return { cwd: fromAgentHostUri(cwd), agentHostCwd: cwd };
  }
  return { cwd };
}
let SessionsTerminalContribution = class extends Disposable {
  constructor(_sessionsManagementService, _sessionsService, _sessionsProvidersService, _terminalService, _agentHostTerminalService, _logService, _pathService, _terminalProfileService, viewsService, contextKeyService) {
    super();
    this._sessionsManagementService = _sessionsManagementService;
    this._sessionsService = _sessionsService;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._terminalService = _terminalService;
    this._agentHostTerminalService = _agentHostTerminalService;
    this._logService = _logService;
    this._pathService = _pathService;
    this._terminalProfileService = _terminalProfileService;
    this._sessionTerminals = /* @__PURE__ */ new Map();
    this._standaloneTerminalIds = /* @__PURE__ */ new Set();
    /** In-flight terminal work for drafts, retained only until each operation settles. */
    this._pendingTerminalOperations = /* @__PURE__ */ new Map();
    /**
     * Session ids already processed as archived. The archive cleanup runs only
     * on the not-archived → archived transition: the provider keeps archived
     * sessions cached and re-emits them in `changed` on every sync, so acting on
     * the current archived state would re-run the cwd cleanup each time and sweep
     * terminals the user opened afterwards. See #313510, #318645.
     */
    this._archivedSessionIds = /* @__PURE__ */ new Set();
    for (const session of this._sessionsManagementService.getSessions()) {
      if (session.isArchived.get()) {
        this._archivedSessionIds.add(session.sessionId);
      }
    }
    const profileOverride = derived((reader) => {
      const session = this._sessionsService.activeSession.read(reader);
      if (!session || session.providerId === LOCAL_AGENT_HOST_PROVIDER_ID) {
        return;
      }
      const address = this._getSessionAgentHostAddress(session);
      if (!address) {
        return;
      }
      const profiles = this._agentHostTerminalService.profiles.read(reader);
      return profiles.find((p) => p.address === address) ?? this._agentHostTerminalService.getProfileForConnection(address);
    });
    this._register(autorun((reader) => {
      const profile = profileOverride.read(reader);
      if (profile) {
        reader.store.add(this._terminalProfileService.overrideDefaultProfile(
          profile.extensionIdentifier,
          profile.profileId
        ));
      }
    }));
    this._register(autorun((reader) => {
      const session = this._sessionsService.activeSession.read(reader);
      if (session?.loading.read(reader)) {
        this._agentHostTerminalService.setDefaultCwd(void 0);
        return;
      }
      const info = getSessionTerminalInfo(session, reader);
      this._agentHostTerminalService.setDefaultCwd(info?.cwd);
    }));
    const terminalViewVisible = SessionsTerminalViewVisibleContext.bindTo(contextKeyService);
    terminalViewVisible.set(viewsService.isViewVisible(TERMINAL_VIEW_ID));
    this._register(viewsService.onDidChangeViewVisibility((e) => {
      if (e.id === TERMINAL_VIEW_ID) {
        terminalViewVisible.set(e.visible);
      }
    }));
    this._register(autorun((reader) => {
      const session = this._sessionsService.activeSession.read(reader);
      if (session?.loading.read(reader)) {
        this._activeKey = void 0;
        this._activeSessionId = void 0;
        return;
      }
      this._onActiveSessionChanged(session);
    }));
    this._register(this._sessionsManagementService.onDidReplaceNewDraftSession(({ from, to }) => {
      this._onDidReplaceNewDraftSession(from, to);
    }));
    this._register(this._sessionsManagementService.onDidReplaceSession(({ from, to }) => {
      this._transferTerminals(from.sessionId, to.sessionId);
    }));
    this._register(this._terminalService.onDidDisposeInstance((instance) => {
      this._removeTerminalFromTrackedSessions(instance.instanceId);
      this._standaloneTerminalIds.delete(instance.instanceId);
    }));
    this._register(this._terminalService.onDidCreateInstance((instance) => {
      if (instance.shellLaunchConfig.hideFromUser) {
        return;
      }
      if (instance.shellLaunchConfig.attachPersistentProcess && this._activeKey) {
        instance.getInitialCwd().then((cwd) => {
          if (cwd.toLowerCase() !== this._activeKey) {
            const availableInstance = this._getAvailableTerminal(instance, `hide restored terminal for ${cwd}`);
            if (!availableInstance) {
              return;
            }
            this._terminalService.moveToBackground(availableInstance);
            this._logService.trace(`[SessionsTerminal] Hid restored terminal ${availableInstance.instanceId} (cwd: ${cwd})`);
          }
        });
      }
    }));
    this._register(this._sessionsManagementService.onDidChangeSessions((e) => {
      for (const session of e.added) {
        if (session.isArchived.get()) {
          this._archivedSessionIds.add(session.sessionId);
        }
      }
      const justArchived = [];
      for (const session of e.changed) {
        if (session.isArchived.get()) {
          if (!this._archivedSessionIds.has(session.sessionId)) {
            this._archivedSessionIds.add(session.sessionId);
            justArchived.push(session);
          }
        } else {
          this._archivedSessionIds.delete(session.sessionId);
        }
      }
      for (const session of e.removed) {
        this._archivedSessionIds.delete(session.sessionId);
      }
      if (e.removed.length === 0 && justArchived.length === 0) {
        return;
      }
      this._logService.trace(`[SessionsTerminal] onDidChangeSessions cleanup (removed: ${e.removed.length}, justArchived: ${justArchived.length}, trackedSessions: ${this._sessionTerminals.size}, activeKey: ${this._activeKey ?? "<none>"})`);
      for (const session of e.removed) {
        void this._closeTerminalsForSession(session.sessionId, `session removed (${session.sessionId})`).finally(() => this._sessionTerminals.delete(session.sessionId));
      }
      for (const session of justArchived) {
        void this._hideTerminalsForSession(session.sessionId, `session archived (${session.sessionId})`);
      }
    }));
  }
  /**
   * Ensures a terminal exists for the given cwd. When a session is provided,
   * tracked terminals for that session id are preferred; otherwise the method
   * falls back to matching untracked terminals by initial cwd for backward
   * compatibility before creating a new terminal. Sets newly created terminals
   * as active and optionally focuses them.
   *
   * When {@link session} is provided and the session is backed by an agent
   * host, the terminal is created on the agent host instead of locally.
   */
  async ensureTerminal(cwd, focus, session) {
    if (!session) {
      return this._ensureTerminal(cwd, focus, session);
    }
    this._beginTerminalOperation(session.sessionId);
    try {
      return await this._ensureTerminal(cwd, focus, session);
    } finally {
      this._endTerminalOperation(session.sessionId);
    }
  }
  async _ensureTerminal(cwd, focus, session) {
    if (session && this._pendingTerminalOperations.get(session.sessionId)?.replaced) {
      return [];
    }
    const key = cwd.fsPath.toLowerCase();
    let existing = session ? this._getTrackedTerminalsForSession(session.sessionId) : [];
    if (existing.length === 0) {
      existing = await this._findTerminalsForKey(key, { excludeTracked: !!session });
      if (session && this._pendingTerminalOperations.get(session.sessionId)?.replaced) {
        return [];
      }
    }
    if (existing.length === 0) {
      try {
        const instance = await this._createTerminalForSession(cwd, session);
        const createdInstance = this._getAvailableTerminal(instance, `activate created terminal for ${cwd.fsPath}`);
        if (!createdInstance) {
          return [];
        }
        if (session && this._pendingTerminalOperations.get(session.sessionId)?.replaced) {
          await this._terminalService.safeDisposeTerminal(createdInstance);
          return [];
        }
        existing = [createdInstance];
        this._terminalService.setActiveInstance(createdInstance);
        this._logService.trace(`[SessionsTerminal] Created terminal ${createdInstance.instanceId} for ${cwd.fsPath}`);
      } catch (e) {
        this._logService.trace(`[SessionsTerminal] Cannot create terminal for ${cwd.fsPath}: ${e}`);
        return [];
      }
    }
    if (session) {
      this._trackTerminalsForSession(session.sessionId, existing);
    }
    if (focus) {
      await this._terminalService.focusActiveInstance();
    }
    return existing;
  }
  /**
   * Creates a terminal for the given cwd. If the session is backed by an
   * agent host, creates an agent host terminal; otherwise creates a local one.
   */
  async _createTerminalForSession(cwd, session) {
    const address = session && this._getSessionAgentHostAddress(session);
    if (address) {
      const instance = await this._agentHostTerminalService.createTerminalForEntry(address, { cwd });
      if (instance) {
        return instance;
      }
    }
    return this._terminalService.createTerminal({ config: { cwd } });
  }
  /**
   * Returns the agent host address for the given session's provider,
   * or `undefined` if the session is not backed by an agent host.
   */
  _getSessionAgentHostAddress(session) {
    if (!session) {
      return void 0;
    }
    const provider = this._sessionsProvidersService.getProvider(session.providerId);
    if (!provider || !isAgentHostProvider(provider)) {
      return void 0;
    }
    return provider.remoteAddress ?? "__local__";
  }
  async _onActiveSessionChanged(session) {
    if (!session) {
      return;
    }
    this._beginTerminalOperation(session.sessionId);
    try {
      const info = getSessionTerminalInfo(session);
      const targetPath = info?.cwd ?? await this._pathService.userHome();
      const targetKey = targetPath.fsPath.toLowerCase();
      if (this._activeKey === targetKey && this._activeSessionId === session.sessionId) {
        return;
      }
      this._activeKey = targetKey;
      this._activeSessionId = session.sessionId;
      const instances = await this._ensureTerminal(targetPath, false, session);
      if (this._activeKey !== targetKey || this._activeSessionId !== session.sessionId) {
        return;
      }
      await this._updateTerminalVisibility(session, targetKey, instances.map((instance) => instance.instanceId));
    } finally {
      this._endTerminalOperation(session.sessionId);
    }
  }
  /**
   * Finds all terminal instances whose initial cwd (lower-cased) matches
   * the given key.
   */
  async _findTerminalsForKey(key, options) {
    const result = [];
    for (const instance of this._terminalService.instances) {
      if (instance.shellLaunchConfig.hideFromUser) {
        continue;
      }
      if (options?.excludeTracked && (this._isTerminalTracked(instance.instanceId) || this._standaloneTerminalIds.has(instance.instanceId))) {
        continue;
      }
      try {
        const cwd = await instance.getInitialCwd();
        if (cwd.toLowerCase() === key) {
          result.push(instance);
        }
      } catch {
      }
    }
    return result;
  }
  _trackTerminalsForSession(sessionId, instances) {
    if (instances.length === 0) {
      return;
    }
    let terminalIds = this._sessionTerminals.get(sessionId);
    if (!terminalIds) {
      terminalIds = /* @__PURE__ */ new Set();
      this._sessionTerminals.set(sessionId, terminalIds);
    }
    for (const instance of instances) {
      terminalIds.add(instance.instanceId);
    }
  }
  _beginTerminalOperation(sessionId) {
    const operation = this._pendingTerminalOperations.get(sessionId);
    if (operation) {
      operation.count++;
      return;
    }
    this._pendingTerminalOperations.set(sessionId, { count: 1, replaced: false });
  }
  _endTerminalOperation(sessionId) {
    const operation = this._pendingTerminalOperations.get(sessionId);
    if (!operation) {
      return;
    }
    operation.count--;
    if (operation.count > 0) {
      return;
    }
    this._pendingTerminalOperations.delete(sessionId);
  }
  _onDidReplaceNewDraftSession(from, to) {
    const pendingOperation = this._pendingTerminalOperations.get(from.sessionId);
    if (pendingOperation) {
      pendingOperation.replaced = true;
    }
    const fromCwd = getSessionTerminalInfo(from)?.cwd.fsPath.toLowerCase();
    const toCwd = getSessionTerminalInfo(to)?.cwd.fsPath.toLowerCase();
    const fromAgentHostAddress = this._getSessionAgentHostAddress(from);
    const toAgentHostAddress = this._getSessionAgentHostAddress(to);
    if (fromCwd === toCwd && fromAgentHostAddress === toAgentHostAddress) {
      this._transferTerminals(from.sessionId, to.sessionId);
    } else {
      this._rehomeTerminals(from.sessionId);
    }
  }
  _rehomeTerminals(sessionId) {
    const terminals = this._getTrackedTerminalsForSession(sessionId);
    for (const terminal of terminals) {
      this._standaloneTerminalIds.add(terminal.instanceId);
    }
    if (terminals.length > 0) {
      this._logService.trace(`[SessionsTerminal] Rehomed ${terminals.length} terminal(s) from session ${sessionId}`);
    }
    this._sessionTerminals.delete(sessionId);
  }
  _transferTerminals(fromSessionId, toSessionId) {
    const terminalIds = this._sessionTerminals.get(fromSessionId);
    if (terminalIds && terminalIds.size > 0) {
      let targetIds = this._sessionTerminals.get(toSessionId);
      if (!targetIds) {
        targetIds = /* @__PURE__ */ new Set();
        this._sessionTerminals.set(toSessionId, targetIds);
      }
      for (const id of terminalIds) {
        targetIds.add(id);
      }
      this._logService.trace(`[SessionsTerminal] Transferred ${terminalIds.size} terminal(s) from session ${fromSessionId} to ${toSessionId}`);
    }
    this._sessionTerminals.delete(fromSessionId);
  }
  _getTrackedTerminalsForSession(sessionId) {
    const terminalIds = this._sessionTerminals.get(sessionId);
    if (!terminalIds) {
      return [];
    }
    const result = [];
    for (const instanceId of [...terminalIds]) {
      const instance = this._terminalService.getInstanceFromId(instanceId);
      if (!instance || instance.isDisposed || instance.shellLaunchConfig.hideFromUser) {
        terminalIds.delete(instanceId);
        continue;
      }
      result.push(instance);
    }
    if (terminalIds.size === 0) {
      this._sessionTerminals.delete(sessionId);
    }
    return result;
  }
  _isTerminalTracked(instanceId) {
    for (const [sessionId, terminalIds] of this._sessionTerminals) {
      if (terminalIds.has(instanceId)) {
        const instance = this._terminalService.getInstanceFromId(instanceId);
        if (!instance || instance.isDisposed) {
          terminalIds.delete(instanceId);
          if (terminalIds.size === 0) {
            this._sessionTerminals.delete(sessionId);
          }
          continue;
        }
        return true;
      }
    }
    return false;
  }
  _removeTerminalFromTrackedSessions(instanceId) {
    for (const [sessionId, terminalIds] of this._sessionTerminals) {
      terminalIds.delete(instanceId);
      if (terminalIds.size === 0) {
        this._sessionTerminals.delete(sessionId);
      }
    }
  }
  _getAvailableTerminal(instance, action) {
    const currentInstance = this._terminalService.getInstanceFromId(instance.instanceId);
    if (!currentInstance || currentInstance.isDisposed) {
      this._logService.trace(`[SessionsTerminal] Cannot ${action}; terminal ${instance.instanceId} is no longer available`);
      return void 0;
    }
    return currentInstance;
  }
  /**
   * Shows background terminals that belong to the active session and hides
   * foreground terminals that belong to other sessions. When the active
   * session has no tracked terminals yet, falls back to initial cwd matching
   * for compatibility with restored terminals from previous sessions.
   */
  async _updateTerminalVisibility(activeSession, activeKey, forceForegroundTerminalIds) {
    const toShow = [];
    const toHide = [];
    const trackedTerminalIds = new Set(this._getTrackedTerminalsForSession(activeSession.sessionId).map((instance) => instance.instanceId));
    for (const instance of [...this._terminalService.instances]) {
      if (instance.shellLaunchConfig.hideFromUser || this._standaloneTerminalIds.has(instance.instanceId)) {
        continue;
      }
      let cwd;
      const currentInstance = this._getAvailableTerminal(instance, "update terminal visibility");
      if (!currentInstance) {
        continue;
      }
      const isForeground = this._terminalService.foregroundInstances.includes(currentInstance);
      const isForceVisible = forceForegroundTerminalIds.includes(currentInstance.instanceId);
      let belongsToActiveSession = trackedTerminalIds.has(currentInstance.instanceId);
      if (!belongsToActiveSession && !this._isTerminalTracked(currentInstance.instanceId)) {
        try {
          cwd = (await currentInstance.getInitialCwd()).toLowerCase();
        } catch {
          continue;
        }
        belongsToActiveSession = cwd === activeKey;
      }
      if ((belongsToActiveSession || isForceVisible) && !isForeground) {
        toShow.push(currentInstance);
      } else if (!belongsToActiveSession && !isForceVisible && isForeground) {
        toHide.push(currentInstance);
      }
    }
    for (const instance of toShow) {
      const availableInstance = this._getAvailableTerminal(instance, "show background terminal");
      if (availableInstance) {
        await this._terminalService.showBackgroundTerminal(availableInstance, true);
      }
    }
    for (const instance of toHide) {
      const availableInstance = this._getAvailableTerminal(instance, "move terminal to background");
      if (availableInstance) {
        this._logService.debug(`[SessionsTerminal] Hiding terminal ${availableInstance.instanceId} (does not belong to active key ${activeKey})`);
        this._terminalService.moveToBackground(availableInstance);
      }
    }
    const foreground = this._terminalService.foregroundInstances;
    let mostRecent;
    let mostRecentTimestamp = -1;
    for (const instance of foreground) {
      if (this._standaloneTerminalIds.has(instance.instanceId)) {
        continue;
      }
      const cmdDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
      const lastCmd = cmdDetection?.commands.at(-1);
      if (lastCmd && lastCmd.timestamp > mostRecentTimestamp) {
        mostRecentTimestamp = lastCmd.timestamp;
        mostRecent = instance;
      }
    }
    if (mostRecent) {
      this._terminalService.setActiveInstance(mostRecent);
    }
  }
  /**
   * Disposes (kills) terminals associated with the given session id. Used
   * when a session is removed: removal is an explicit user action, so the pty
   * is torn down.
   *
   * Never disposes the terminal the user is currently working in. Removal also
   * covers session *graduation* (untitled → committed via `onDidReplaceSession`,
   * which surfaces the skeleton in `removed`): the focused (active) instance is
   * therefore always protected.
   *
   * {@link reason} is logged for each killed terminal so unexpected disposals in
   * the agents window can be diagnosed from the logs. See #313510, #318645.
   */
  async _closeTerminalsForSession(sessionId, reason) {
    const protectedInstanceId = this._terminalService.activeInstance?.instanceId;
    for (const instance of this._getTrackedTerminalsForSession(sessionId)) {
      if (protectedInstanceId !== void 0 && instance.instanceId === protectedInstanceId) {
        this._logService.info(`[SessionsTerminal] Skipping active terminal ${instance.instanceId} for session ${sessionId} (user is working in it)`);
        continue;
      }
      const availableInstance = this._getAvailableTerminal(instance, `close removed session terminal for session ${sessionId}`);
      if (!availableInstance) {
        continue;
      }
      this._logService.info(`[SessionsTerminal] Killing terminal ${availableInstance.instanceId} (session: ${sessionId}, reason: ${reason})`);
      await this._terminalService.safeDisposeTerminal(availableInstance);
      this._removeTerminalFromTrackedSessions(availableInstance.instanceId);
    }
  }
  /**
   * Hides (moves to background) terminals associated with the given session id
   * without disposing them. Used when a session is archived ("Mark as Done"):
   * archiving is reversible and the pty must survive so it can be shown again.
   *
   * Archiving is asynchronous and can land while the user is working in a
   * just-opened terminal at this cwd, so the focused (active) instance is
   * never hidden out from under the user.
   *
   * {@link reason} is logged for each hidden terminal so unexpected visibility
   * changes in the agents window can be diagnosed from the logs. See #313510,
   * #318645.
   */
  async _hideTerminalsForSession(sessionId, reason) {
    const protectedInstanceId = this._terminalService.activeInstance?.instanceId;
    for (const instance of this._getTrackedTerminalsForSession(sessionId)) {
      if (protectedInstanceId !== void 0 && instance.instanceId === protectedInstanceId) {
        this._logService.info(`[SessionsTerminal] Skipping active terminal ${instance.instanceId} for session ${sessionId} (user is working in it)`);
        continue;
      }
      const availableInstance = this._getAvailableTerminal(instance, `hide archived terminal for session ${sessionId}`);
      if (!availableInstance) {
        continue;
      }
      this._logService.info(`[SessionsTerminal] Hiding terminal ${availableInstance.instanceId} (session: ${sessionId}, reason: ${reason})`);
      this._terminalService.moveToBackground(availableInstance);
    }
  }
  async dumpTracking() {
    console.log(`[SessionsTerminal] Active key: ${this._activeKey ?? "<none>"}`);
    console.log(`[SessionsTerminal] Session terminals: ${JSON.stringify([...this._sessionTerminals.entries()].map(([sessionId, terminalIds]) => [sessionId, [...terminalIds]]))}`);
    console.log(`[SessionsTerminal] Standalone terminals: ${JSON.stringify([...this._standaloneTerminalIds])}`);
    console.log("[SessionsTerminal] === All Terminals ===");
    for (const instance of this._terminalService.instances) {
      let cwd = "<unknown>";
      try {
        cwd = await instance.getInitialCwd();
      } catch {
      }
      const isForeground = this._terminalService.foregroundInstances.includes(instance);
      console.log(`  ${instance.instanceId} - ${cwd} - ${isForeground ? "foreground" : "background"}`);
    }
  }
  async showAllTerminals() {
    for (const instance of this._terminalService.instances) {
      if (!this._terminalService.foregroundInstances.includes(instance)) {
        await this._terminalService.showBackgroundTerminal(instance, true);
        this._logService.trace(`[SessionsTerminal] Moved terminal ${instance.instanceId} to foreground`);
      }
    }
  }
};
SessionsTerminalContribution.ID = "workbench.contrib.sessionsTerminal";
SessionsTerminalContribution = __decorateClass([
  __decorateParam(0, ISessionsManagementService),
  __decorateParam(1, ISessionsService),
  __decorateParam(2, ISessionsProvidersService),
  __decorateParam(3, ITerminalService),
  __decorateParam(4, IAgentHostTerminalService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IPathService),
  __decorateParam(7, ITerminalProfileService),
  __decorateParam(8, IViewsService),
  __decorateParam(9, IContextKeyService)
], SessionsTerminalContribution);
registerWorkbenchContribution2(SessionsTerminalContribution.ID, SessionsTerminalContribution, WorkbenchPhase.AfterRestored);
let RegisterAgentHostSessionTaskRunnerContribution = class extends Disposable {
  constructor(instantiationService, registry) {
    super();
    const runner = instantiationService.createInstance(AgentHostSessionTaskRunner);
    this._register(registry.register(runner));
  }
};
RegisterAgentHostSessionTaskRunnerContribution.ID = "workbench.contrib.sessions.registerAgentHostTaskRunner";
RegisterAgentHostSessionTaskRunnerContribution = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ISessionTaskRunnerRegistry)
], RegisterAgentHostSessionTaskRunnerContribution);
registerWorkbenchContribution2(RegisterAgentHostSessionTaskRunnerContribution.ID, RegisterAgentHostSessionTaskRunnerContribution, WorkbenchPhase.BlockStartup);
class OpenSessionInTerminalAction extends Action2 {
  constructor() {
    super({
      id: "agentSession.openInTerminal",
      title: localize2("openInTerminal", "Open Terminal"),
      icon: Codicon.terminal,
      // The panel is hidden while a custom view replaces the sessions grid.
      precondition: CustomViewVisibleContext.negate(),
      toggled: {
        condition: SessionsTerminalViewVisibleContext,
        title: localize("hideTerminal", "Hide Terminal")
      },
      menu: [{
        id: Menus.TitleBarSessionMenu,
        group: "navigation",
        order: 10,
        when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), IsPhoneLayoutContext.negate())
      }]
    });
  }
  async run(_accessor) {
    const telemetryService = _accessor.get(ITelemetryService);
    logSessionsInteraction(telemetryService, "openTerminal");
    const layoutService = _accessor.get(IWorkbenchLayoutService);
    const viewsService = _accessor.get(IViewsService);
    if (layoutService.isVisible(Parts.PANEL_PART)) {
      if (viewsService.isViewVisible(TERMINAL_VIEW_ID)) {
        layoutService.setPartHidden(true, Parts.PANEL_PART);
        return;
      }
    }
    const contribution = getWorkbenchContribution(SessionsTerminalContribution.ID);
    const sessionsService = _accessor.get(ISessionsService);
    const pathService = _accessor.get(IPathService);
    const activeSession = sessionsService.activeSession.get();
    const info = getSessionTerminalInfo(activeSession);
    const cwd = info?.cwd ?? await pathService.userHome();
    await contribution.ensureTerminal(cwd, true, activeSession);
    viewsService.openView(TERMINAL_VIEW_ID);
  }
}
registerAction2(OpenSessionInTerminalAction);
class DumpTerminalTrackingAction extends Action2 {
  constructor() {
    super({
      id: "agentSession.dumpTerminalTracking",
      title: localize2("dumpTerminalTracking", "Dump Terminal Tracking"),
      f1: true
    });
  }
  async run() {
    const contribution = getWorkbenchContribution(SessionsTerminalContribution.ID);
    await contribution.dumpTracking();
  }
}
registerAction2(DumpTerminalTrackingAction);
class ShowAllTerminalsAction extends Action2 {
  constructor() {
    super({
      id: "agentSession.showAllTerminals",
      title: localize2("showAllTerminals", "Show All Terminals"),
      f1: true
    });
  }
  async run() {
    const contribution = getWorkbenchContribution(SessionsTerminalContribution.ID);
    await contribution.showAllTerminals();
  }
}
registerAction2(ShowAllTerminalsAction);
export {
  SessionsTerminalContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci9zZXNzaW9uc1Rlcm1pbmFsQ29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgSVJlYWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX1NDSEVNRSwgZnJvbUFnZW50SG9zdFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBnZXRXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvYWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWVudXMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL21lbnVzLmpzJztcbmltcG9ydCB7IGlzQWdlbnRIb3N0UHJvdmlkZXIsIExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uc1dlbGNvbWVWaXNpYmxlQ29udGV4dCwgSXNQaG9uZUxheW91dENvbnRleHQsIEN1c3RvbVZpZXdWaXNpYmxlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBsb2dTZXNzaW9uc0ludGVyYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25zVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxQcm9maWxlU2VydmljZSwgVEVSTUlOQUxfVklFV19JRCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFydHMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvblRhc2tSdW5uZXJSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9zZXNzaW9uVGFza1J1bm5lci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTZXNzaW9uVGFza1J1bm5lciB9IGZyb20gJy4vYWdlbnRIb3N0U2Vzc2lvblRhc2tSdW5uZXIuanMnO1xuXG5jb25zdCBTZXNzaW9uc1Rlcm1pbmFsVmlld1Zpc2libGVDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3Nlc3Npb25zVGVybWluYWxWaWV3VmlzaWJsZScsIGZhbHNlKTtcblxuaW50ZXJmYWNlIElTZXNzaW9uVGVybWluYWxJbmZvIHtcblx0LyoqIFRoZSBjd2QgdG8gdXNlIGZvciB0ZXJtaW5hbCBtYXRjaGluZy9jcmVhdGlvbi4gRm9yIGFnZW50IGhvc3Qgc2Vzc2lvbnMgdGhpcyBpcyB0aGUgdW53cmFwcGVkIGZpbGUgVVJJLiAqL1xuXHRyZWFkb25seSBjd2Q6IFVSSTtcblx0LyoqIFdoZW4gc2V0LCB0aGUgdGVybWluYWwgc2hvdWxkIGJlIGNyZWF0ZWQgb24gdGhlIGFnZW50IGhvc3QgcmF0aGVyIHRoYW4gbG9jYWxseS4gKi9cblx0cmVhZG9ubHkgYWdlbnRIb3N0Q3dkPzogVVJJO1xufVxuXG5pbnRlcmZhY2UgSVBlbmRpbmdUZXJtaW5hbE9wZXJhdGlvbiB7XG5cdGNvdW50OiBudW1iZXI7XG5cdHJlcGxhY2VkOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGVybWluYWwgaW5mbyBmb3IgdGhlIGdpdmVuIHNlc3Npb246IHdvcmt0cmVlIG9yIHJlcG9zaXRvcnkgcGF0aCBmb3JcbiAqIHdvcmtzcGFjZS1iYWNrZWQgYWdlbnQgc2Vzc2lvbnMuIFJldHVybnMgYHVuZGVmaW5lZGAgZm9yIHNlc3Npb25zIHdpdGhvdXQgYVxuICogd29ya3NwYWNlIChlLmcuIENsb3VkKSwgb3Igd2hlbiBubyBwYXRoIGlzIGF2YWlsYWJsZS5cbiAqL1xuZnVuY3Rpb24gZ2V0U2Vzc2lvblRlcm1pbmFsSW5mbyhzZXNzaW9uOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCwgcmVhZGVyPzogSVJlYWRlcik6IElTZXNzaW9uVGVybWluYWxJbmZvIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB3b3Jrc3BhY2UgPSByZWFkZXIgPyBzZXNzaW9uLndvcmtzcGFjZS5yZWFkKHJlYWRlcikgOiBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKTtcblx0aWYgKHdvcmtzcGFjZT8uaXNWaXJ0dWFsV29ya3NwYWNlICE9PSBmYWxzZSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgZm9sZGVyID0gd29ya3NwYWNlLmZvbGRlcnNbMF07XG5cdGNvbnN0IGN3ZCA9IGZvbGRlcj8ud29ya2luZ0RpcmVjdG9yeTtcblx0aWYgKCFjd2QpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChjd2Quc2NoZW1lID09PSBBR0VOVF9IT1NUX1NDSEVNRSkge1xuXHRcdHJldHVybiB7IGN3ZDogZnJvbUFnZW50SG9zdFVyaShjd2QpLCBhZ2VudEhvc3RDd2Q6IGN3ZCB9O1xuXHR9XG5cdHJldHVybiB7IGN3ZCB9O1xufVxuXG4vKipcbiAqIE1hbmFnZXMgdGVybWluYWwgaW5zdGFuY2VzIGluIHRoZSBzZXNzaW9ucyB3aW5kb3csIGVuc3VyaW5nOlxuICogLSBBIHRlcm1pbmFsIGV4aXN0cyBmb3IgdGhlIGFjdGl2ZSBzZXNzaW9uJ3Mgd29ya3RyZWUgKG9yIHJlcG9zaXRvcnkgaWYgbm8gd29ya3RyZWUpLlxuICogLSBUZXJtaW5hbHMgYXJlIHRyYWNrZWQgcGVyIHNlc3Npb24gaWQgYW5kIHNob3duL2hpZGRlbiBiYXNlZCBvbiB0aGF0IGFzc29jaWF0aW9uLlxuICogLSBUZXJtaW5hbHMgY3JlYXRlZCBiZWZvcmUgc2Vzc2lvbi1pZCB0cmFja2luZyBmYWxsIGJhY2sgdG8gaW5pdGlhbCBjd2QgbWF0Y2hpbmdcbiAqICAgdW50aWwgdGhleSBhcmUgYXNzb2NpYXRlZCB3aXRoIGEgc2Vzc2lvbiBpbiB0aGlzIHdpbmRvdy5cbiAqIC0gVGVybWluYWxzIGZvciBhcmNoaXZlZC9yZW1vdmVkIHNlc3Npb25zIGFyZSBoaWRkZW4vY2xvc2VkIHVzaW5nIHRoZWlyIHRyYWNrZWRcbiAqICAgc2Vzc2lvbiBpZCBhc3NvY2lhdGlvbiB3aGlsZSBrZWVwaW5nIHRoZSBhY3RpdmUgdGVybWluYWwgcHJvdGVjdGVkLlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbnNUZXJtaW5hbENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuc2Vzc2lvbnNUZXJtaW5hbCc7XG5cblx0cHJpdmF0ZSBfYWN0aXZlS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FjdGl2ZVNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uVGVybWluYWxzID0gbmV3IE1hcDxzdHJpbmcsIFNldDxudW1iZXI+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGFuZGFsb25lVGVybWluYWxJZHMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblx0LyoqIEluLWZsaWdodCB0ZXJtaW5hbCB3b3JrIGZvciBkcmFmdHMsIHJldGFpbmVkIG9ubHkgdW50aWwgZWFjaCBvcGVyYXRpb24gc2V0dGxlcy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1Rlcm1pbmFsT3BlcmF0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJUGVuZGluZ1Rlcm1pbmFsT3BlcmF0aW9uPigpO1xuXG5cdC8qKlxuXHQgKiBTZXNzaW9uIGlkcyBhbHJlYWR5IHByb2Nlc3NlZCBhcyBhcmNoaXZlZC4gVGhlIGFyY2hpdmUgY2xlYW51cCBydW5zIG9ubHlcblx0ICogb24gdGhlIG5vdC1hcmNoaXZlZCBcdTIxOTIgYXJjaGl2ZWQgdHJhbnNpdGlvbjogdGhlIHByb3ZpZGVyIGtlZXBzIGFyY2hpdmVkXG5cdCAqIHNlc3Npb25zIGNhY2hlZCBhbmQgcmUtZW1pdHMgdGhlbSBpbiBgY2hhbmdlZGAgb24gZXZlcnkgc3luYywgc28gYWN0aW5nIG9uXG5cdCAqIHRoZSBjdXJyZW50IGFyY2hpdmVkIHN0YXRlIHdvdWxkIHJlLXJ1biB0aGUgY3dkIGNsZWFudXAgZWFjaCB0aW1lIGFuZCBzd2VlcFxuXHQgKiB0ZXJtaW5hbHMgdGhlIHVzZXIgb3BlbmVkIGFmdGVyd2FyZHMuIFNlZSAjMzEzNTEwLCAjMzE4NjQ1LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYXJjaGl2ZWRTZXNzaW9uSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdFRlcm1pbmFsU2VydmljZTogSUFnZW50SG9zdFRlcm1pbmFsU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlU2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSB2aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gU2VlZCB3aXRoIHNlc3Npb25zIHRoYXQgYXJlIGFscmVhZHkgYXJjaGl2ZWQgKGUuZy4gcmVzdG9yZWQgYXJjaGl2ZWRcblx0XHQvLyBmcm9tIGEgcHJldmlvdXMgd2luZG93KSBzbyB0aGV5IGFyZSBub3QgdHJlYXRlZCBhcyBuZXdseSBhcmNoaXZlZCBvblxuXHRcdC8vIHRoZWlyIGZpcnN0IGNoYW5nZSBldmVudC5cblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9ucygpKSB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5pc0FyY2hpdmVkLmdldCgpKSB7XG5cdFx0XHRcdHRoaXMuX2FyY2hpdmVkU2Vzc2lvbklkcy5hZGQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHByb2ZpbGVPdmVycmlkZSA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXNlc3Npb24gfHwgc2Vzc2lvbi5wcm92aWRlcklkID09PSBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lEKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gbm8gbmVlZCB0byBvdmVycmlkZSBsb2NhbCBkZWZhdWx0IHByb2ZpbGVzIHdpdGggdGhlIGxvY2FsIEFIXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFkZHJlc3MgPSB0aGlzLl9nZXRTZXNzaW9uQWdlbnRIb3N0QWRkcmVzcyhzZXNzaW9uKTtcblx0XHRcdGlmICghYWRkcmVzcykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByb2ZpbGVzID0gdGhpcy5fYWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlLnByb2ZpbGVzLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBwcm9maWxlcy5maW5kKHAgPT4gcC5hZGRyZXNzID09PSBhZGRyZXNzKSA/PyB0aGlzLl9hZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UuZ2V0UHJvZmlsZUZvckNvbm5lY3Rpb24oYWRkcmVzcyk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBwcm9maWxlID0gcHJvZmlsZU92ZXJyaWRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChwcm9maWxlKSB7XG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQodGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5vdmVycmlkZURlZmF1bHRQcm9maWxlKFxuXHRcdFx0XHRcdHByb2ZpbGUuZXh0ZW5zaW9uSWRlbnRpZmllciwgcHJvZmlsZS5wcm9maWxlSWQsXG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEtlZXAgdGhlIGRlZmF1bHQgY3dkIGluIHN5bmMgd2l0aCB0aGUgYWN0aXZlIHNlc3Npb24ncyB3b3JraW5nIGRpcmVjdG9yeVxuXHRcdC8vIHNvIHRoYXQgXCJOZXcgVGVybWluYWxcIiB1c2VzIGl0IGF1dG9tYXRpY2FsbHkuXG5cdFx0Ly8gVGhpcyBpcyBhIGxpdHRsZSBoYWNreSBidXQgSSBkb24ndCBzZWUgYW55IGJldHRlciBhcHByb2FjaC5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHNlc3Npb24/LmxvYWRpbmcucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHRoaXMuX2FnZW50SG9zdFRlcm1pbmFsU2VydmljZS5zZXREZWZhdWx0Q3dkKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGluZm8gPSBnZXRTZXNzaW9uVGVybWluYWxJbmZvKHNlc3Npb24sIHJlYWRlcik7XG5cdFx0XHR0aGlzLl9hZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2Uuc2V0RGVmYXVsdEN3ZChpbmZvPy5jd2QpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRyYWNrIHdoZXRoZXIgdGhlIHRlcm1pbmFsIHZpZXcgaXMgdmlzaWJsZSBzbyB0aGUgdGl0bGViYXIgdG9nZ2xlXG5cdFx0Ly8gYnV0dG9uIHNob3dzIHRoZSBjb3JyZWN0IGNoZWNrZWQgc3RhdGUuXG5cdFx0Y29uc3QgdGVybWluYWxWaWV3VmlzaWJsZSA9IFNlc3Npb25zVGVybWluYWxWaWV3VmlzaWJsZUNvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0ZXJtaW5hbFZpZXdWaXNpYmxlLnNldCh2aWV3c1NlcnZpY2UuaXNWaWV3VmlzaWJsZShURVJNSU5BTF9WSUVXX0lEKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodmlld3NTZXJ2aWNlLm9uRGlkQ2hhbmdlVmlld1Zpc2liaWxpdHkoZSA9PiB7XG5cdFx0XHRpZiAoZS5pZCA9PT0gVEVSTUlOQUxfVklFV19JRCkge1xuXHRcdFx0XHR0ZXJtaW5hbFZpZXdWaXNpYmxlLnNldChlLnZpc2libGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlYWN0IHRvIGFjdGl2ZSBzZXNzaW9uIGNoYW5nZXMgXHUyMDE0IHVzZSB3b3JrdHJlZS9yZXBvIGZvciBiYWNrZ3JvdW5kIHNlc3Npb25zLCBob21lIGRpciBvdGhlcndpc2Vcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHNlc3Npb24/LmxvYWRpbmcucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZUtleSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fYWN0aXZlU2Vzc2lvbklkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkFjdGl2ZVNlc3Npb25DaGFuZ2VkKHNlc3Npb24pO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlcGVhdGVkIE5ldyBTZXNzaW9uIGFjdGlvbnMgcmVwbGFjZSBvbmUgZHJhZnQgd2l0aCBhbm90aGVyLiBUcmFuc2ZlclxuXHRcdC8vIHRoZSBvbGQgZHJhZnQncyB0ZXJtaW5hbHMgd2hlbiBib3RoIGRyYWZ0cyB1c2UgdGhlIHNhbWUgY3dkIGFuZCBiYWNrZW5kLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uKCh7IGZyb20sIHRvIH0pID0+IHtcblx0XHRcdHRoaXMuX29uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbihmcm9tLCB0byk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gV2hlbiBhIHNlc3Npb24gaXMgcmVwbGFjZWQgKHVudGl0bGVkIFx1MjE5MiBjb21taXR0ZWQgZ3JhZHVhdGlvbiksIHRyYW5zZmVyXG5cdFx0Ly8gdHJhY2tlZCB0ZXJtaW5hbHMgZnJvbSB0aGUgb2xkIHNlc3Npb24gaWQgdG8gdGhlIG5ldyBvbmUgc28gdGhleSBhcmVcblx0XHQvLyBub3Qgb3JwaGFuZWQgYW5kIGNsb3NlZCBieSB0aGUgcmVtb3ZhbCBjbGVhbnVwLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWRSZXBsYWNlU2Vzc2lvbigoeyBmcm9tLCB0byB9KSA9PiB7XG5cdFx0XHR0aGlzLl90cmFuc2ZlclRlcm1pbmFscyhmcm9tLnNlc3Npb25JZCwgdG8uc2Vzc2lvbklkKTtcblx0XHR9KSk7XG5cblx0XHQvLyBDbGVhbiB1cCB0cmFja2VkIHRlcm1pbmFsIGlkcyB3aGVuIHRlcm1pbmFscyBhcmUgZXh0ZXJuYWxseSBkaXNwb3NlZFxuXHRcdC8vIChlLmcuIHVzZXIgY2xvc2VzIGEgdGVybWluYWwgdGFiKSBzbyB0aGUgbWFwIGRvZXNuJ3QgaG9sZCBzdGFsZSBlbnRyaWVzLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkRpZERpc3Bvc2VJbnN0YW5jZShpbnN0YW5jZSA9PiB7XG5cdFx0XHR0aGlzLl9yZW1vdmVUZXJtaW5hbEZyb21UcmFja2VkU2Vzc2lvbnMoaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0XHR0aGlzLl9zdGFuZGFsb25lVGVybWluYWxJZHMuZGVsZXRlKGluc3RhbmNlLmluc3RhbmNlSWQpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEhpZGUgcmVzdG9yZWQgdGVybWluYWxzIGZyb20gYSBwcmV2aW91cyB3aW5kb3cgc2Vzc2lvbiB0aGF0IGRvbid0XG5cdFx0Ly8gYmVsb25nIHRvIHRoZSBjdXJyZW50IGFjdGl2ZSBzZXNzaW9uLiBUaGVzZSBhcnJpdmUgYXN5bmNocm9ub3VzbHlcblx0XHQvLyBkdXJpbmcgcmVjb25uZWN0aW9uIGFuZCB3b3VsZCBvdGhlcndpc2UgZmxhc2ggaW4gdGhlIGZvcmVncm91bmQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxTZXJ2aWNlLm9uRGlkQ3JlYXRlSW5zdGFuY2UoaW5zdGFuY2UgPT4ge1xuXHRcdFx0Ly8gU2tpcCBoaWRkZW4gdG9vbCB0ZXJtaW5hbHMgXHUyMDE0IG1hbmFnZWQgYnkgdGhlIGNoYXQgdG9vbCBsaWZlY3ljbGVcblx0XHRcdGlmIChpbnN0YW5jZS5zaGVsbExhdW5jaENvbmZpZy5oaWRlRnJvbVVzZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzICYmIHRoaXMuX2FjdGl2ZUtleSkge1xuXHRcdFx0XHRpbnN0YW5jZS5nZXRJbml0aWFsQ3dkKCkudGhlbihjd2QgPT4ge1xuXHRcdFx0XHRcdGlmIChjd2QudG9Mb3dlckNhc2UoKSAhPT0gdGhpcy5fYWN0aXZlS2V5KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBhdmFpbGFibGVJbnN0YW5jZSA9IHRoaXMuX2dldEF2YWlsYWJsZVRlcm1pbmFsKGluc3RhbmNlLCBgaGlkZSByZXN0b3JlZCB0ZXJtaW5hbCBmb3IgJHtjd2R9YCk7XG5cdFx0XHRcdFx0XHRpZiAoIWF2YWlsYWJsZUluc3RhbmNlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5tb3ZlVG9CYWNrZ3JvdW5kKGF2YWlsYWJsZUluc3RhbmNlKTtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uc1Rlcm1pbmFsXSBIaWQgcmVzdG9yZWQgdGVybWluYWwgJHthdmFpbGFibGVJbnN0YW5jZS5pbnN0YW5jZUlkfSAoY3dkOiAke2N3ZH0pYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBDbGVhbiB1cCB0ZXJtaW5hbHMgZm9yIGFyY2hpdmVkL3JlbW92ZWQgc2Vzc2lvbnMgdXNpbmcgdGhlaXIgdHJhY2tlZFxuXHRcdC8vIHNlc3Npb24tdG8tdGVybWluYWwgYXNzb2NpYXRpb25zLlxuXHRcdC8vXG5cdFx0Ly8gQXJjaGl2ZSB2cyByZW1vdmUgZGlmZmVyIGluIGhvdyBhZ2dyZXNzaXZlIHRoZSBjbGVhbnVwIGlzOlxuXHRcdC8vIC0gQXJjaGl2aW5nIGlzIHJldmVyc2libGUgYW5kIHRlcm1pbmFscyBjYW4gYmUgcmV1c2VkIGJ5XG5cdFx0Ly8gICB0aGUgc2FtZSBzZXNzaW9uLCBzbyB3ZSBvbmx5IEhJREUgdGhlIHRlcm1pbmFsICh0aGUgcHR5IHN1cnZpdmVzIGFuZCBjYW5cblx0XHQvLyAgIGJlIHNob3duIGFnYWluIG9uIHVuYXJjaGl2ZSBvciByZXVzZSkuIFNlZSBgX2hpZGVUZXJtaW5hbHNGb3JTZXNzaW9uYC5cblx0XHQvLyAtIFJlbW92YWwgaXMgYW4gZXhwbGljaXQsIGRlc3RydWN0aXZlIHVzZXIgYWN0aW9uLCBzbyB3ZSBLSUxMIHRoZVxuXHRcdC8vICAgdGVybWluYWwuIFNlZSBgX2Nsb3NlVGVybWluYWxzRm9yU2Vzc2lvbmAuXG5cdFx0Ly9cblx0XHQvLyBUaGUgYXJjaGl2ZSBjbGVhbnVwIHJ1bnMgb25seSBvbiB0aGUgbm90LWFyY2hpdmVkIFx1MjE5MiBhcmNoaXZlZCB0cmFuc2l0aW9uLlxuXHRcdC8vIFRoZSBwcm92aWRlciBrZWVwcyBhcmNoaXZlZCBzZXNzaW9ucyBjYWNoZWQgYW5kIHJlLWVtaXRzIHRoZW0gaW5cblx0XHQvLyBgY2hhbmdlZGAgb24gZXZlcnkgc3luYzsgYWN0aW5nIG9uIHRoZSBjdXJyZW50IGFyY2hpdmVkIHN0YXRlIHdvdWxkXG5cdFx0Ly8gcmUtcnVuIHRoZSBjd2QgY2xlYW51cCBlYWNoIHRpbWUgYW5kIHN3ZWVwIHRlcm1pbmFscyB0aGUgdXNlciBvcGVuZWRcblx0XHQvLyBhZnRlciBhcmNoaXZpbmcuXG5cdFx0Ly9cblx0XHQvLyBCb3RoIHBhdGhzIGFyZSBhc3luY2hyb25vdXMgYW5kIGNhbiBsYW5kIHdoaWxlIHRoZSB1c2VyIGlzIHdvcmtpbmcgaW4gYVxuXHRcdC8vIGp1c3Qtb3BlbmVkIHRlcm1pbmFsIGF0IHRoaXMgY3dkIChlLmcuIHJlbW92YWwgYWxzbyBjb3ZlcnMgdW50aXRsZWQgXHUyMTkyXG5cdFx0Ly8gY29tbWl0dGVkIGdyYWR1YXRpb24gdmlhIGBvbkRpZFJlcGxhY2VTZXNzaW9uYCwgd2hpY2ggc3VyZmFjZXMgdGhlXG5cdFx0Ly8gc2tlbGV0b24gaW4gYHJlbW92ZWRgKS4gVGhlIGZvY3VzZWQgKGFjdGl2ZSkgdGVybWluYWwgaXMgdGhlcmVmb3JlIG5ldmVyXG5cdFx0Ly8gdG91Y2hlZCBvbiBlaXRoZXIgcGF0aC4gU2VlICMzMTM1MTAsICMzMTg2NDUuXG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiB7XG5cdFx0XHQvLyBPbmx5IGFjdCBvbiB0aGUgbm90LWFyY2hpdmVkIFx1MjE5MiBhcmNoaXZlZCB0cmFuc2l0aW9uOyBpZ25vcmUgcmUtZW1pdHNcblx0XHRcdC8vIG9mIHNlc3Npb25zIGFscmVhZHkga25vd24gdG8gYmUgYXJjaGl2ZWQuIEtlZXAgdGhlIHRyYWNrZWQgc2V0IGluXG5cdFx0XHQvLyBzeW5jOiByZWNvcmQgc2Vzc2lvbnMgdGhhdCBhcnJpdmUgYWxyZWFkeS1hcmNoaXZlZCAoZS5nLiByZXN0b3JlZFxuXHRcdFx0Ly8gZnJvbSBhIHByZXZpb3VzIHdpbmRvdykgc28gdGhleSBuZXZlciBjb3VudCBhcyBhIGZyZXNoIHRyYW5zaXRpb24sXG5cdFx0XHQvLyBhbmQgZHJvcCBpZHMgdGhhdCB3ZXJlIHVuLWFyY2hpdmVkIG9yIHJlbW92ZWQuXG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgZS5hZGRlZCkge1xuXHRcdFx0XHRpZiAoc2Vzc2lvbi5pc0FyY2hpdmVkLmdldCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5fYXJjaGl2ZWRTZXNzaW9uSWRzLmFkZChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGp1c3RBcmNoaXZlZDogSVNlc3Npb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGUuY2hhbmdlZCkge1xuXHRcdFx0XHRpZiAoc2Vzc2lvbi5pc0FyY2hpdmVkLmdldCgpKSB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9hcmNoaXZlZFNlc3Npb25JZHMuaGFzKHNlc3Npb24uc2Vzc2lvbklkKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fYXJjaGl2ZWRTZXNzaW9uSWRzLmFkZChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHRcdFx0XHRqdXN0QXJjaGl2ZWQucHVzaChzZXNzaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fYXJjaGl2ZWRTZXNzaW9uSWRzLmRlbGV0ZShzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBlLnJlbW92ZWQpIHtcblx0XHRcdFx0dGhpcy5fYXJjaGl2ZWRTZXNzaW9uSWRzLmRlbGV0ZShzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5yZW1vdmVkLmxlbmd0aCA9PT0gMCAmJiBqdXN0QXJjaGl2ZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uc1Rlcm1pbmFsXSBvbkRpZENoYW5nZVNlc3Npb25zIGNsZWFudXAgKHJlbW92ZWQ6ICR7ZS5yZW1vdmVkLmxlbmd0aH0sIGp1c3RBcmNoaXZlZDogJHtqdXN0QXJjaGl2ZWQubGVuZ3RofSwgdHJhY2tlZFNlc3Npb25zOiAke3RoaXMuX3Nlc3Npb25UZXJtaW5hbHMuc2l6ZX0sIGFjdGl2ZUtleTogJHt0aGlzLl9hY3RpdmVLZXkgPz8gJzxub25lPid9KWApO1xuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGUucmVtb3ZlZCkge1xuXHRcdFx0XHR2b2lkIHRoaXMuX2Nsb3NlVGVybWluYWxzRm9yU2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCwgYHNlc3Npb24gcmVtb3ZlZCAoJHtzZXNzaW9uLnNlc3Npb25JZH0pYCkuZmluYWxseSgoKSA9PiB0aGlzLl9zZXNzaW9uVGVybWluYWxzLmRlbGV0ZShzZXNzaW9uLnNlc3Npb25JZCkpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGp1c3RBcmNoaXZlZCkge1xuXHRcdFx0XHR2b2lkIHRoaXMuX2hpZGVUZXJtaW5hbHNGb3JTZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkLCBgc2Vzc2lvbiBhcmNoaXZlZCAoJHtzZXNzaW9uLnNlc3Npb25JZH0pYCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVuc3VyZXMgYSB0ZXJtaW5hbCBleGlzdHMgZm9yIHRoZSBnaXZlbiBjd2QuIFdoZW4gYSBzZXNzaW9uIGlzIHByb3ZpZGVkLFxuXHQgKiB0cmFja2VkIHRlcm1pbmFscyBmb3IgdGhhdCBzZXNzaW9uIGlkIGFyZSBwcmVmZXJyZWQ7IG90aGVyd2lzZSB0aGUgbWV0aG9kXG5cdCAqIGZhbGxzIGJhY2sgdG8gbWF0Y2hpbmcgdW50cmFja2VkIHRlcm1pbmFscyBieSBpbml0aWFsIGN3ZCBmb3IgYmFja3dhcmRcblx0ICogY29tcGF0aWJpbGl0eSBiZWZvcmUgY3JlYXRpbmcgYSBuZXcgdGVybWluYWwuIFNldHMgbmV3bHkgY3JlYXRlZCB0ZXJtaW5hbHNcblx0ICogYXMgYWN0aXZlIGFuZCBvcHRpb25hbGx5IGZvY3VzZXMgdGhlbS5cblx0ICpcblx0ICogV2hlbiB7QGxpbmsgc2Vzc2lvbn0gaXMgcHJvdmlkZWQgYW5kIHRoZSBzZXNzaW9uIGlzIGJhY2tlZCBieSBhbiBhZ2VudFxuXHQgKiBob3N0LCB0aGUgdGVybWluYWwgaXMgY3JlYXRlZCBvbiB0aGUgYWdlbnQgaG9zdCBpbnN0ZWFkIG9mIGxvY2FsbHkuXG5cdCAqL1xuXHRhc3luYyBlbnN1cmVUZXJtaW5hbChjd2Q6IFVSSSwgZm9jdXM6IGJvb2xlYW4sIHNlc3Npb24/OiBJU2Vzc2lvbik6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2VbXT4ge1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2Vuc3VyZVRlcm1pbmFsKGN3ZCwgZm9jdXMsIHNlc3Npb24pO1xuXHRcdH1cblxuXHRcdHRoaXMuX2JlZ2luVGVybWluYWxPcGVyYXRpb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fZW5zdXJlVGVybWluYWwoY3dkLCBmb2N1cywgc2Vzc2lvbik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2VuZFRlcm1pbmFsT3BlcmF0aW9uKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVUZXJtaW5hbChjd2Q6IFVSSSwgZm9jdXM6IGJvb2xlYW4sIHNlc3Npb24/OiBJU2Vzc2lvbik6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2VbXT4ge1xuXHRcdGlmIChzZXNzaW9uICYmIHRoaXMuX3BlbmRpbmdUZXJtaW5hbE9wZXJhdGlvbnMuZ2V0KHNlc3Npb24uc2Vzc2lvbklkKT8ucmVwbGFjZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBrZXkgPSBjd2QuZnNQYXRoLnRvTG93ZXJDYXNlKCk7XG5cdFx0bGV0IGV4aXN0aW5nID0gc2Vzc2lvbiA/IHRoaXMuX2dldFRyYWNrZWRUZXJtaW5hbHNGb3JTZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkKSA6IFtdO1xuXHRcdGlmIChleGlzdGluZy5sZW5ndGggPT09IDApIHtcblx0XHRcdGV4aXN0aW5nID0gYXdhaXQgdGhpcy5fZmluZFRlcm1pbmFsc0ZvcktleShrZXksIHsgZXhjbHVkZVRyYWNrZWQ6ICEhc2Vzc2lvbiB9KTtcblx0XHRcdGlmIChzZXNzaW9uICYmIHRoaXMuX3BlbmRpbmdUZXJtaW5hbE9wZXJhdGlvbnMuZ2V0KHNlc3Npb24uc2Vzc2lvbklkKT8ucmVwbGFjZWQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChleGlzdGluZy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgdGhpcy5fY3JlYXRlVGVybWluYWxGb3JTZXNzaW9uKGN3ZCwgc2Vzc2lvbik7XG5cdFx0XHRcdGNvbnN0IGNyZWF0ZWRJbnN0YW5jZSA9IHRoaXMuX2dldEF2YWlsYWJsZVRlcm1pbmFsKGluc3RhbmNlLCBgYWN0aXZhdGUgY3JlYXRlZCB0ZXJtaW5hbCBmb3IgJHtjd2QuZnNQYXRofWApO1xuXHRcdFx0XHRpZiAoIWNyZWF0ZWRJbnN0YW5jZSkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc2Vzc2lvbiAmJiB0aGlzLl9wZW5kaW5nVGVybWluYWxPcGVyYXRpb25zLmdldChzZXNzaW9uLnNlc3Npb25JZCk/LnJlcGxhY2VkKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fdGVybWluYWxTZXJ2aWNlLnNhZmVEaXNwb3NlVGVybWluYWwoY3JlYXRlZEluc3RhbmNlKTtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblx0XHRcdFx0ZXhpc3RpbmcgPSBbY3JlYXRlZEluc3RhbmNlXTtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKGNyZWF0ZWRJbnN0YW5jZSk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uc1Rlcm1pbmFsXSBDcmVhdGVkIHRlcm1pbmFsICR7Y3JlYXRlZEluc3RhbmNlLmluc3RhbmNlSWR9IGZvciAke2N3ZC5mc1BhdGh9YCk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uc1Rlcm1pbmFsXSBDYW5ub3QgY3JlYXRlIHRlcm1pbmFsIGZvciAke2N3ZC5mc1BhdGh9OiAke2V9YCk7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fdHJhY2tUZXJtaW5hbHNGb3JTZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkLCBleGlzdGluZyk7XG5cdFx0fVxuXG5cdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuZm9jdXNBY3RpdmVJbnN0YW5jZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBleGlzdGluZztcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgdGVybWluYWwgZm9yIHRoZSBnaXZlbiBjd2QuIElmIHRoZSBzZXNzaW9uIGlzIGJhY2tlZCBieSBhblxuXHQgKiBhZ2VudCBob3N0LCBjcmVhdGVzIGFuIGFnZW50IGhvc3QgdGVybWluYWw7IG90aGVyd2lzZSBjcmVhdGVzIGEgbG9jYWwgb25lLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlVGVybWluYWxGb3JTZXNzaW9uKGN3ZDogVVJJLCBzZXNzaW9uOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2U+IHtcblx0XHRjb25zdCBhZGRyZXNzID0gc2Vzc2lvbiAmJiB0aGlzLl9nZXRTZXNzaW9uQWdlbnRIb3N0QWRkcmVzcyhzZXNzaW9uKTtcblx0XHRpZiAoYWRkcmVzcykge1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCB0aGlzLl9hZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UuY3JlYXRlVGVybWluYWxGb3JFbnRyeShhZGRyZXNzLCB7IGN3ZCB9KTtcblx0XHRcdGlmIChpbnN0YW5jZSkge1xuXHRcdFx0XHRyZXR1cm4gaW5zdGFuY2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuY3JlYXRlVGVybWluYWwoeyBjb25maWc6IHsgY3dkIH0gfSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgYWdlbnQgaG9zdCBhZGRyZXNzIGZvciB0aGUgZ2l2ZW4gc2Vzc2lvbidzIHByb3ZpZGVyLFxuXHQgKiBvciBgdW5kZWZpbmVkYCBpZiB0aGUgc2Vzc2lvbiBpcyBub3QgYmFja2VkIGJ5IGFuIGFnZW50IGhvc3QuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRTZXNzaW9uQWdlbnRIb3N0QWRkcmVzcyhzZXNzaW9uOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcihzZXNzaW9uLnByb3ZpZGVySWQpO1xuXHRcdGlmICghcHJvdmlkZXIgfHwgIWlzQWdlbnRIb3N0UHJvdmlkZXIocHJvdmlkZXIpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvdmlkZXIucmVtb3RlQWRkcmVzcyA/PyAnX19sb2NhbF9fJztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29uQWN0aXZlU2Vzc2lvbkNoYW5nZWQoc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9iZWdpblRlcm1pbmFsT3BlcmF0aW9uKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaW5mbyA9IGdldFNlc3Npb25UZXJtaW5hbEluZm8oc2Vzc2lvbik7XG5cdFx0XHRjb25zdCB0YXJnZXRQYXRoID0gaW5mbz8uY3dkID8/IGF3YWl0IHRoaXMuX3BhdGhTZXJ2aWNlLnVzZXJIb21lKCk7XG5cdFx0XHRjb25zdCB0YXJnZXRLZXkgPSB0YXJnZXRQYXRoLmZzUGF0aC50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0aWYgKHRoaXMuX2FjdGl2ZUtleSA9PT0gdGFyZ2V0S2V5ICYmIHRoaXMuX2FjdGl2ZVNlc3Npb25JZCA9PT0gc2Vzc2lvbi5zZXNzaW9uSWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYWN0aXZlS2V5ID0gdGFyZ2V0S2V5O1xuXHRcdFx0dGhpcy5fYWN0aXZlU2Vzc2lvbklkID0gc2Vzc2lvbi5zZXNzaW9uSWQ7XG5cblx0XHRcdGNvbnN0IGluc3RhbmNlcyA9IGF3YWl0IHRoaXMuX2Vuc3VyZVRlcm1pbmFsKHRhcmdldFBhdGgsIGZhbHNlLCBzZXNzaW9uKTtcblxuXHRcdFx0Ly8gSWYgdGhlIGFjdGl2ZSBzZXNzaW9uIG9yIGtleSBjaGFuZ2VkIHdoaWxlIHdlIHdlcmUgYXdhaXRpbmcsIGEgbmV3ZXJcblx0XHRcdC8vIGNhbGwgaGFzIHRha2VuIG92ZXIgXHUyMDE0IHNraXAgdGhlIHZpc2liaWxpdHkgdXBkYXRlIHRvIGF2b2lkIGZsaWNrZXIuXG5cdFx0XHRpZiAodGhpcy5fYWN0aXZlS2V5ICE9PSB0YXJnZXRLZXkgfHwgdGhpcy5fYWN0aXZlU2Vzc2lvbklkICE9PSBzZXNzaW9uLnNlc3Npb25JZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl91cGRhdGVUZXJtaW5hbFZpc2liaWxpdHkoc2Vzc2lvbiwgdGFyZ2V0S2V5LCBpbnN0YW5jZXMubWFwKGluc3RhbmNlID0+IGluc3RhbmNlLmluc3RhbmNlSWQpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fZW5kVGVybWluYWxPcGVyYXRpb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kcyBhbGwgdGVybWluYWwgaW5zdGFuY2VzIHdob3NlIGluaXRpYWwgY3dkIChsb3dlci1jYXNlZCkgbWF0Y2hlc1xuXHQgKiB0aGUgZ2l2ZW4ga2V5LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZmluZFRlcm1pbmFsc0ZvcktleShrZXk6IHN0cmluZywgb3B0aW9ucz86IHsgZXhjbHVkZVRyYWNrZWQ/OiBib29sZWFuIH0pOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlW10+IHtcblx0XHRjb25zdCByZXN1bHQ6IElUZXJtaW5hbEluc3RhbmNlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5pbnN0YW5jZXMpIHtcblx0XHRcdC8vIFNraXAgaGlkZGVuIHRvb2wgdGVybWluYWxzIFx1MjAxNCBtYW5hZ2VkIGJ5IHRoZSBjaGF0IHRvb2wgbGlmZWN5Y2xlXG5cdFx0XHRpZiAoaW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcuaGlkZUZyb21Vc2VyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG9wdGlvbnM/LmV4Y2x1ZGVUcmFja2VkICYmICh0aGlzLl9pc1Rlcm1pbmFsVHJhY2tlZChpbnN0YW5jZS5pbnN0YW5jZUlkKSB8fCB0aGlzLl9zdGFuZGFsb25lVGVybWluYWxJZHMuaGFzKGluc3RhbmNlLmluc3RhbmNlSWQpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGN3ZCA9IGF3YWl0IGluc3RhbmNlLmdldEluaXRpYWxDd2QoKTtcblx0XHRcdFx0aWYgKGN3ZC50b0xvd2VyQ2FzZSgpID09PSBrZXkpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChpbnN0YW5jZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgdGVybWluYWxzIHdob3NlIGN3ZCBjYW5ub3QgYmUgcmVzb2x2ZWRcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3RyYWNrVGVybWluYWxzRm9yU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZywgaW5zdGFuY2VzOiByZWFkb25seSBJVGVybWluYWxJbnN0YW5jZVtdKTogdm9pZCB7XG5cdFx0aWYgKGluc3RhbmNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IHRlcm1pbmFsSWRzID0gdGhpcy5fc2Vzc2lvblRlcm1pbmFscy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIXRlcm1pbmFsSWRzKSB7XG5cdFx0XHR0ZXJtaW5hbElkcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvblRlcm1pbmFscy5zZXQoc2Vzc2lvbklkLCB0ZXJtaW5hbElkcyk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgaW5zdGFuY2VzKSB7XG5cdFx0XHR0ZXJtaW5hbElkcy5hZGQoaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYmVnaW5UZXJtaW5hbE9wZXJhdGlvbihzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG9wZXJhdGlvbiA9IHRoaXMuX3BlbmRpbmdUZXJtaW5hbE9wZXJhdGlvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKG9wZXJhdGlvbikge1xuXHRcdFx0b3BlcmF0aW9uLmNvdW50Kys7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdUZXJtaW5hbE9wZXJhdGlvbnMuc2V0KHNlc3Npb25JZCwgeyBjb3VudDogMSwgcmVwbGFjZWQ6IGZhbHNlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5kVGVybWluYWxPcGVyYXRpb24oc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBvcGVyYXRpb24gPSB0aGlzLl9wZW5kaW5nVGVybWluYWxPcGVyYXRpb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmICghb3BlcmF0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdG9wZXJhdGlvbi5jb3VudC0tO1xuXHRcdGlmIChvcGVyYXRpb24uY291bnQgPiAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdUZXJtaW5hbE9wZXJhdGlvbnMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZFJlcGxhY2VOZXdEcmFmdFNlc3Npb24oZnJvbTogSVNlc3Npb24sIHRvOiBJU2Vzc2lvbik6IHZvaWQge1xuXHRcdGNvbnN0IHBlbmRpbmdPcGVyYXRpb24gPSB0aGlzLl9wZW5kaW5nVGVybWluYWxPcGVyYXRpb25zLmdldChmcm9tLnNlc3Npb25JZCk7XG5cdFx0aWYgKHBlbmRpbmdPcGVyYXRpb24pIHtcblx0XHRcdHBlbmRpbmdPcGVyYXRpb24ucmVwbGFjZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZyb21Dd2QgPSBnZXRTZXNzaW9uVGVybWluYWxJbmZvKGZyb20pPy5jd2QuZnNQYXRoLnRvTG93ZXJDYXNlKCk7XG5cdFx0Y29uc3QgdG9Dd2QgPSBnZXRTZXNzaW9uVGVybWluYWxJbmZvKHRvKT8uY3dkLmZzUGF0aC50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IGZyb21BZ2VudEhvc3RBZGRyZXNzID0gdGhpcy5fZ2V0U2Vzc2lvbkFnZW50SG9zdEFkZHJlc3MoZnJvbSk7XG5cdFx0Y29uc3QgdG9BZ2VudEhvc3RBZGRyZXNzID0gdGhpcy5fZ2V0U2Vzc2lvbkFnZW50SG9zdEFkZHJlc3ModG8pO1xuXHRcdGlmIChmcm9tQ3dkID09PSB0b0N3ZCAmJiBmcm9tQWdlbnRIb3N0QWRkcmVzcyA9PT0gdG9BZ2VudEhvc3RBZGRyZXNzKSB7XG5cdFx0XHR0aGlzLl90cmFuc2ZlclRlcm1pbmFscyhmcm9tLnNlc3Npb25JZCwgdG8uc2Vzc2lvbklkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVob21lVGVybWluYWxzKGZyb20uc2Vzc2lvbklkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWhvbWVUZXJtaW5hbHMoc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB0ZXJtaW5hbHMgPSB0aGlzLl9nZXRUcmFja2VkVGVybWluYWxzRm9yU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGZvciAoY29uc3QgdGVybWluYWwgb2YgdGVybWluYWxzKSB7XG5cdFx0XHR0aGlzLl9zdGFuZGFsb25lVGVybWluYWxJZHMuYWRkKHRlcm1pbmFsLmluc3RhbmNlSWQpO1xuXHRcdH1cblx0XHRpZiAodGVybWluYWxzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uc1Rlcm1pbmFsXSBSZWhvbWVkICR7dGVybWluYWxzLmxlbmd0aH0gdGVybWluYWwocykgZnJvbSBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9uVGVybWluYWxzLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdHJhbnNmZXJUZXJtaW5hbHMoZnJvbVNlc3Npb25JZDogc3RyaW5nLCB0b1Nlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVybWluYWxJZHMgPSB0aGlzLl9zZXNzaW9uVGVybWluYWxzLmdldChmcm9tU2Vzc2lvbklkKTtcblx0XHRpZiAodGVybWluYWxJZHMgJiYgdGVybWluYWxJZHMuc2l6ZSA+IDApIHtcblx0XHRcdGxldCB0YXJnZXRJZHMgPSB0aGlzLl9zZXNzaW9uVGVybWluYWxzLmdldCh0b1Nlc3Npb25JZCk7XG5cdFx0XHRpZiAoIXRhcmdldElkcykge1xuXHRcdFx0XHR0YXJnZXRJZHMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvblRlcm1pbmFscy5zZXQodG9TZXNzaW9uSWQsIHRhcmdldElkcyk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIHRlcm1pbmFsSWRzKSB7XG5cdFx0XHRcdHRhcmdldElkcy5hZGQoaWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1Nlc3Npb25zVGVybWluYWxdIFRyYW5zZmVycmVkICR7dGVybWluYWxJZHMuc2l6ZX0gdGVybWluYWwocykgZnJvbSBzZXNzaW9uICR7ZnJvbVNlc3Npb25JZH0gdG8gJHt0b1Nlc3Npb25JZH1gKTtcblx0XHR9XG5cdFx0dGhpcy5fc2Vzc2lvblRlcm1pbmFscy5kZWxldGUoZnJvbVNlc3Npb25JZCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUcmFja2VkVGVybWluYWxzRm9yU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IElUZXJtaW5hbEluc3RhbmNlW10ge1xuXHRcdGNvbnN0IHRlcm1pbmFsSWRzID0gdGhpcy5fc2Vzc2lvblRlcm1pbmFscy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIXRlcm1pbmFsSWRzKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBJVGVybWluYWxJbnN0YW5jZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBpbnN0YW5jZUlkIG9mIFsuLi50ZXJtaW5hbElkc10pIHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmdldEluc3RhbmNlRnJvbUlkKGluc3RhbmNlSWQpO1xuXHRcdFx0aWYgKCFpbnN0YW5jZSB8fCBpbnN0YW5jZS5pc0Rpc3Bvc2VkIHx8IGluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLmhpZGVGcm9tVXNlcikge1xuXHRcdFx0XHR0ZXJtaW5hbElkcy5kZWxldGUoaW5zdGFuY2VJZCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2goaW5zdGFuY2UpO1xuXHRcdH1cblxuXHRcdGlmICh0ZXJtaW5hbElkcy5zaXplID09PSAwKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uVGVybWluYWxzLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9pc1Rlcm1pbmFsVHJhY2tlZChpbnN0YW5jZUlkOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRmb3IgKGNvbnN0IFtzZXNzaW9uSWQsIHRlcm1pbmFsSWRzXSBvZiB0aGlzLl9zZXNzaW9uVGVybWluYWxzKSB7XG5cdFx0XHRpZiAodGVybWluYWxJZHMuaGFzKGluc3RhbmNlSWQpKSB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmdldEluc3RhbmNlRnJvbUlkKGluc3RhbmNlSWQpO1xuXHRcdFx0XHRpZiAoIWluc3RhbmNlIHx8IGluc3RhbmNlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHR0ZXJtaW5hbElkcy5kZWxldGUoaW5zdGFuY2VJZCk7XG5cdFx0XHRcdFx0aWYgKHRlcm1pbmFsSWRzLnNpemUgPT09IDApIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25UZXJtaW5hbHMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVUZXJtaW5hbEZyb21UcmFja2VkU2Vzc2lvbnMoaW5zdGFuY2VJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbc2Vzc2lvbklkLCB0ZXJtaW5hbElkc10gb2YgdGhpcy5fc2Vzc2lvblRlcm1pbmFscykge1xuXHRcdFx0dGVybWluYWxJZHMuZGVsZXRlKGluc3RhbmNlSWQpO1xuXHRcdFx0aWYgKHRlcm1pbmFsSWRzLnNpemUgPT09IDApIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvblRlcm1pbmFscy5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRBdmFpbGFibGVUZXJtaW5hbChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIGFjdGlvbjogc3RyaW5nKTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGN1cnJlbnRJbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5nZXRJbnN0YW5jZUZyb21JZChpbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0XHRpZiAoIWN1cnJlbnRJbnN0YW5jZSB8fCBjdXJyZW50SW5zdGFuY2UuaXNEaXNwb3NlZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1Nlc3Npb25zVGVybWluYWxdIENhbm5vdCAke2FjdGlvbn07IHRlcm1pbmFsICR7aW5zdGFuY2UuaW5zdGFuY2VJZH0gaXMgbm8gbG9uZ2VyIGF2YWlsYWJsZWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIGN1cnJlbnRJbnN0YW5jZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93cyBiYWNrZ3JvdW5kIHRlcm1pbmFscyB0aGF0IGJlbG9uZyB0byB0aGUgYWN0aXZlIHNlc3Npb24gYW5kIGhpZGVzXG5cdCAqIGZvcmVncm91bmQgdGVybWluYWxzIHRoYXQgYmVsb25nIHRvIG90aGVyIHNlc3Npb25zLiBXaGVuIHRoZSBhY3RpdmVcblx0ICogc2Vzc2lvbiBoYXMgbm8gdHJhY2tlZCB0ZXJtaW5hbHMgeWV0LCBmYWxscyBiYWNrIHRvIGluaXRpYWwgY3dkIG1hdGNoaW5nXG5cdCAqIGZvciBjb21wYXRpYmlsaXR5IHdpdGggcmVzdG9yZWQgdGVybWluYWxzIGZyb20gcHJldmlvdXMgc2Vzc2lvbnMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVUZXJtaW5hbFZpc2liaWxpdHkoYWN0aXZlU2Vzc2lvbjogSVNlc3Npb24sIGFjdGl2ZUtleTogc3RyaW5nLCBmb3JjZUZvcmVncm91bmRUZXJtaW5hbElkczogbnVtYmVyW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0b1Nob3c6IElUZXJtaW5hbEluc3RhbmNlW10gPSBbXTtcblx0XHRjb25zdCB0b0hpZGU6IElUZXJtaW5hbEluc3RhbmNlW10gPSBbXTtcblx0XHRjb25zdCB0cmFja2VkVGVybWluYWxJZHMgPSBuZXcgU2V0KHRoaXMuX2dldFRyYWNrZWRUZXJtaW5hbHNGb3JTZXNzaW9uKGFjdGl2ZVNlc3Npb24uc2Vzc2lvbklkKS5tYXAoaW5zdGFuY2UgPT4gaW5zdGFuY2UuaW5zdGFuY2VJZCkpO1xuXG5cdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiBbLi4udGhpcy5fdGVybWluYWxTZXJ2aWNlLmluc3RhbmNlc10pIHtcblx0XHRcdC8vIFNraXAgaGlkZGVuIHRvb2wgdGVybWluYWxzIFx1MjAxNCBtYW5hZ2VkIGJ5IHRoZSBjaGF0IHRvb2wgbGlmZWN5Y2xlXG5cdFx0XHRpZiAoaW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcuaGlkZUZyb21Vc2VyIHx8IHRoaXMuX3N0YW5kYWxvbmVUZXJtaW5hbElkcy5oYXMoaW5zdGFuY2UuaW5zdGFuY2VJZCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRsZXQgY3dkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBjdXJyZW50SW5zdGFuY2UgPSB0aGlzLl9nZXRBdmFpbGFibGVUZXJtaW5hbChpbnN0YW5jZSwgJ3VwZGF0ZSB0ZXJtaW5hbCB2aXNpYmlsaXR5Jyk7XG5cdFx0XHRpZiAoIWN1cnJlbnRJbnN0YW5jZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXNGb3JlZ3JvdW5kID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmZvcmVncm91bmRJbnN0YW5jZXMuaW5jbHVkZXMoY3VycmVudEluc3RhbmNlKTtcblx0XHRcdGNvbnN0IGlzRm9yY2VWaXNpYmxlID0gZm9yY2VGb3JlZ3JvdW5kVGVybWluYWxJZHMuaW5jbHVkZXMoY3VycmVudEluc3RhbmNlLmluc3RhbmNlSWQpO1xuXHRcdFx0bGV0IGJlbG9uZ3NUb0FjdGl2ZVNlc3Npb24gPSB0cmFja2VkVGVybWluYWxJZHMuaGFzKGN1cnJlbnRJbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0XHRcdGlmICghYmVsb25nc1RvQWN0aXZlU2Vzc2lvbiAmJiAhdGhpcy5faXNUZXJtaW5hbFRyYWNrZWQoY3VycmVudEluc3RhbmNlLmluc3RhbmNlSWQpKSB7XG5cdFx0XHRcdC8vIFVudHJhY2tlZCB0ZXJtaW5hbCAoZS5nLiByZXN0b3JlZCBmcm9tIGEgcHJldmlvdXMgd2luZG93KSBcdTIwMTQgZmFsbFxuXHRcdFx0XHQvLyBiYWNrIHRvIGN3ZCBtYXRjaGluZyBzbyBpdCBpcyBzaG93biBhbG9uZ3NpZGUgdGhlIHNlc3Npb24ncyB0cmFja2VkXG5cdFx0XHRcdC8vIHRlcm1pbmFscyByYXRoZXIgdGhhbiBpbmNvcnJlY3RseSBoaWRkZW4uXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y3dkID0gKGF3YWl0IGN1cnJlbnRJbnN0YW5jZS5nZXRJbml0aWFsQ3dkKCkpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJlbG9uZ3NUb0FjdGl2ZVNlc3Npb24gPSBjd2QgPT09IGFjdGl2ZUtleTtcblx0XHRcdH1cblx0XHRcdGlmICgoYmVsb25nc1RvQWN0aXZlU2Vzc2lvbiB8fCBpc0ZvcmNlVmlzaWJsZSkgJiYgIWlzRm9yZWdyb3VuZCkge1xuXHRcdFx0XHR0b1Nob3cucHVzaChjdXJyZW50SW5zdGFuY2UpO1xuXHRcdFx0fSBlbHNlIGlmICghYmVsb25nc1RvQWN0aXZlU2Vzc2lvbiAmJiAhaXNGb3JjZVZpc2libGUgJiYgaXNGb3JlZ3JvdW5kKSB7XG5cdFx0XHRcdHRvSGlkZS5wdXNoKGN1cnJlbnRJbnN0YW5jZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiB0b1Nob3cpIHtcblx0XHRcdGNvbnN0IGF2YWlsYWJsZUluc3RhbmNlID0gdGhpcy5fZ2V0QXZhaWxhYmxlVGVybWluYWwoaW5zdGFuY2UsICdzaG93IGJhY2tncm91bmQgdGVybWluYWwnKTtcblx0XHRcdGlmIChhdmFpbGFibGVJbnN0YW5jZSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2hvd0JhY2tncm91bmRUZXJtaW5hbChhdmFpbGFibGVJbnN0YW5jZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgdG9IaWRlKSB7XG5cdFx0XHRjb25zdCBhdmFpbGFibGVJbnN0YW5jZSA9IHRoaXMuX2dldEF2YWlsYWJsZVRlcm1pbmFsKGluc3RhbmNlLCAnbW92ZSB0ZXJtaW5hbCB0byBiYWNrZ3JvdW5kJyk7XG5cdFx0XHRpZiAoYXZhaWxhYmxlSW5zdGFuY2UpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW1Nlc3Npb25zVGVybWluYWxdIEhpZGluZyB0ZXJtaW5hbCAke2F2YWlsYWJsZUluc3RhbmNlLmluc3RhbmNlSWR9IChkb2VzIG5vdCBiZWxvbmcgdG8gYWN0aXZlIGtleSAke2FjdGl2ZUtleX0pYCk7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5tb3ZlVG9CYWNrZ3JvdW5kKGF2YWlsYWJsZUluc3RhbmNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTZXQgdGhlIHRlcm1pbmFsIHdpdGggdGhlIG1vc3QgcmVjZW50IGNvbW1hbmQgYXMgYWN0aXZlXG5cdFx0Y29uc3QgZm9yZWdyb3VuZCA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5mb3JlZ3JvdW5kSW5zdGFuY2VzO1xuXHRcdGxldCBtb3N0UmVjZW50OiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbW9zdFJlY2VudFRpbWVzdGFtcCA9IC0xO1xuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgZm9yZWdyb3VuZCkge1xuXHRcdFx0aWYgKHRoaXMuX3N0YW5kYWxvbmVUZXJtaW5hbElkcy5oYXMoaW5zdGFuY2UuaW5zdGFuY2VJZCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjbWREZXRlY3Rpb24gPSBpbnN0YW5jZS5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKTtcblx0XHRcdGNvbnN0IGxhc3RDbWQgPSBjbWREZXRlY3Rpb24/LmNvbW1hbmRzLmF0KC0xKTtcblx0XHRcdGlmIChsYXN0Q21kICYmIGxhc3RDbWQudGltZXN0YW1wID4gbW9zdFJlY2VudFRpbWVzdGFtcCkge1xuXHRcdFx0XHRtb3N0UmVjZW50VGltZXN0YW1wID0gbGFzdENtZC50aW1lc3RhbXA7XG5cdFx0XHRcdG1vc3RSZWNlbnQgPSBpbnN0YW5jZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKG1vc3RSZWNlbnQpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZShtb3N0UmVjZW50KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRGlzcG9zZXMgKGtpbGxzKSB0ZXJtaW5hbHMgYXNzb2NpYXRlZCB3aXRoIHRoZSBnaXZlbiBzZXNzaW9uIGlkLiBVc2VkXG5cdCAqIHdoZW4gYSBzZXNzaW9uIGlzIHJlbW92ZWQ6IHJlbW92YWwgaXMgYW4gZXhwbGljaXQgdXNlciBhY3Rpb24sIHNvIHRoZSBwdHlcblx0ICogaXMgdG9ybiBkb3duLlxuXHQgKlxuXHQgKiBOZXZlciBkaXNwb3NlcyB0aGUgdGVybWluYWwgdGhlIHVzZXIgaXMgY3VycmVudGx5IHdvcmtpbmcgaW4uIFJlbW92YWwgYWxzb1xuXHQgKiBjb3ZlcnMgc2Vzc2lvbiAqZ3JhZHVhdGlvbiogKHVudGl0bGVkIFx1MjE5MiBjb21taXR0ZWQgdmlhIGBvbkRpZFJlcGxhY2VTZXNzaW9uYCxcblx0ICogd2hpY2ggc3VyZmFjZXMgdGhlIHNrZWxldG9uIGluIGByZW1vdmVkYCk6IHRoZSBmb2N1c2VkIChhY3RpdmUpIGluc3RhbmNlIGlzXG5cdCAqIHRoZXJlZm9yZSBhbHdheXMgcHJvdGVjdGVkLlxuXHQgKlxuXHQgKiB7QGxpbmsgcmVhc29ufSBpcyBsb2dnZWQgZm9yIGVhY2gga2lsbGVkIHRlcm1pbmFsIHNvIHVuZXhwZWN0ZWQgZGlzcG9zYWxzIGluXG5cdCAqIHRoZSBhZ2VudHMgd2luZG93IGNhbiBiZSBkaWFnbm9zZWQgZnJvbSB0aGUgbG9ncy4gU2VlICMzMTM1MTAsICMzMTg2NDUuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9jbG9zZVRlcm1pbmFsc0ZvclNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcsIHJlYXNvbjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJvdGVjdGVkSW5zdGFuY2VJZCA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5hY3RpdmVJbnN0YW5jZT8uaW5zdGFuY2VJZDtcblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIHRoaXMuX2dldFRyYWNrZWRUZXJtaW5hbHNGb3JTZXNzaW9uKHNlc3Npb25JZCkpIHtcblx0XHRcdGlmIChwcm90ZWN0ZWRJbnN0YW5jZUlkICE9PSB1bmRlZmluZWQgJiYgaW5zdGFuY2UuaW5zdGFuY2VJZCA9PT0gcHJvdGVjdGVkSW5zdGFuY2VJZCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtTZXNzaW9uc1Rlcm1pbmFsXSBTa2lwcGluZyBhY3RpdmUgdGVybWluYWwgJHtpbnN0YW5jZS5pbnN0YW5jZUlkfSBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH0gKHVzZXIgaXMgd29ya2luZyBpbiBpdClgKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhdmFpbGFibGVJbnN0YW5jZSA9IHRoaXMuX2dldEF2YWlsYWJsZVRlcm1pbmFsKGluc3RhbmNlLCBgY2xvc2UgcmVtb3ZlZCBzZXNzaW9uIHRlcm1pbmFsIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuXHRcdFx0aWYgKCFhdmFpbGFibGVJbnN0YW5jZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1Nlc3Npb25zVGVybWluYWxdIEtpbGxpbmcgdGVybWluYWwgJHthdmFpbGFibGVJbnN0YW5jZS5pbnN0YW5jZUlkfSAoc2Vzc2lvbjogJHtzZXNzaW9uSWR9LCByZWFzb246ICR7cmVhc29ufSlgKTtcblx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zYWZlRGlzcG9zZVRlcm1pbmFsKGF2YWlsYWJsZUluc3RhbmNlKTtcblx0XHRcdHRoaXMuX3JlbW92ZVRlcm1pbmFsRnJvbVRyYWNrZWRTZXNzaW9ucyhhdmFpbGFibGVJbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSGlkZXMgKG1vdmVzIHRvIGJhY2tncm91bmQpIHRlcm1pbmFscyBhc3NvY2lhdGVkIHdpdGggdGhlIGdpdmVuIHNlc3Npb24gaWRcblx0ICogd2l0aG91dCBkaXNwb3NpbmcgdGhlbS4gVXNlZCB3aGVuIGEgc2Vzc2lvbiBpcyBhcmNoaXZlZCAoXCJNYXJrIGFzIERvbmVcIik6XG5cdCAqIGFyY2hpdmluZyBpcyByZXZlcnNpYmxlIGFuZCB0aGUgcHR5IG11c3Qgc3Vydml2ZSBzbyBpdCBjYW4gYmUgc2hvd24gYWdhaW4uXG5cdCAqXG5cdCAqIEFyY2hpdmluZyBpcyBhc3luY2hyb25vdXMgYW5kIGNhbiBsYW5kIHdoaWxlIHRoZSB1c2VyIGlzIHdvcmtpbmcgaW4gYVxuXHQgKiBqdXN0LW9wZW5lZCB0ZXJtaW5hbCBhdCB0aGlzIGN3ZCwgc28gdGhlIGZvY3VzZWQgKGFjdGl2ZSkgaW5zdGFuY2UgaXNcblx0ICogbmV2ZXIgaGlkZGVuIG91dCBmcm9tIHVuZGVyIHRoZSB1c2VyLlxuXHQgKlxuXHQgKiB7QGxpbmsgcmVhc29ufSBpcyBsb2dnZWQgZm9yIGVhY2ggaGlkZGVuIHRlcm1pbmFsIHNvIHVuZXhwZWN0ZWQgdmlzaWJpbGl0eVxuXHQgKiBjaGFuZ2VzIGluIHRoZSBhZ2VudHMgd2luZG93IGNhbiBiZSBkaWFnbm9zZWQgZnJvbSB0aGUgbG9ncy4gU2VlICMzMTM1MTAsXG5cdCAqICMzMTg2NDUuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9oaWRlVGVybWluYWxzRm9yU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZywgcmVhc29uOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm90ZWN0ZWRJbnN0YW5jZUlkID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlPy5pbnN0YW5jZUlkO1xuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgdGhpcy5fZ2V0VHJhY2tlZFRlcm1pbmFsc0ZvclNlc3Npb24oc2Vzc2lvbklkKSkge1xuXHRcdFx0aWYgKHByb3RlY3RlZEluc3RhbmNlSWQgIT09IHVuZGVmaW5lZCAmJiBpbnN0YW5jZS5pbnN0YW5jZUlkID09PSBwcm90ZWN0ZWRJbnN0YW5jZUlkKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1Nlc3Npb25zVGVybWluYWxdIFNraXBwaW5nIGFjdGl2ZSB0ZXJtaW5hbCAke2luc3RhbmNlLmluc3RhbmNlSWR9IGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfSAodXNlciBpcyB3b3JraW5nIGluIGl0KWApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGF2YWlsYWJsZUluc3RhbmNlID0gdGhpcy5fZ2V0QXZhaWxhYmxlVGVybWluYWwoaW5zdGFuY2UsIGBoaWRlIGFyY2hpdmVkIHRlcm1pbmFsIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuXHRcdFx0aWYgKCFhdmFpbGFibGVJbnN0YW5jZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1Nlc3Npb25zVGVybWluYWxdIEhpZGluZyB0ZXJtaW5hbCAke2F2YWlsYWJsZUluc3RhbmNlLmluc3RhbmNlSWR9IChzZXNzaW9uOiAke3Nlc3Npb25JZH0sIHJlYXNvbjogJHtyZWFzb259KWApO1xuXHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLm1vdmVUb0JhY2tncm91bmQoYXZhaWxhYmxlSW5zdGFuY2UpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGR1bXBUcmFja2luZygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zb2xlLmxvZyhgW1Nlc3Npb25zVGVybWluYWxdIEFjdGl2ZSBrZXk6ICR7dGhpcy5fYWN0aXZlS2V5ID8/ICc8bm9uZT4nfWApO1xuXHRcdGNvbnNvbGUubG9nKGBbU2Vzc2lvbnNUZXJtaW5hbF0gU2Vzc2lvbiB0ZXJtaW5hbHM6ICR7SlNPTi5zdHJpbmdpZnkoWy4uLnRoaXMuX3Nlc3Npb25UZXJtaW5hbHMuZW50cmllcygpXS5tYXAoKFtzZXNzaW9uSWQsIHRlcm1pbmFsSWRzXSkgPT4gW3Nlc3Npb25JZCwgWy4uLnRlcm1pbmFsSWRzXV0pKX1gKTtcblx0XHRjb25zb2xlLmxvZyhgW1Nlc3Npb25zVGVybWluYWxdIFN0YW5kYWxvbmUgdGVybWluYWxzOiAke0pTT04uc3RyaW5naWZ5KFsuLi50aGlzLl9zdGFuZGFsb25lVGVybWluYWxJZHNdKX1gKTtcblx0XHRjb25zb2xlLmxvZygnW1Nlc3Npb25zVGVybWluYWxdID09PSBBbGwgVGVybWluYWxzID09PScpO1xuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmluc3RhbmNlcykge1xuXHRcdFx0bGV0IGN3ZCA9ICc8dW5rbm93bj4nO1xuXHRcdFx0dHJ5IHsgY3dkID0gYXdhaXQgaW5zdGFuY2UuZ2V0SW5pdGlhbEN3ZCgpOyB9IGNhdGNoIHsgLyogaWdub3JlZCAqLyB9XG5cdFx0XHRjb25zdCBpc0ZvcmVncm91bmQgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuZm9yZWdyb3VuZEluc3RhbmNlcy5pbmNsdWRlcyhpbnN0YW5jZSk7XG5cdFx0XHRjb25zb2xlLmxvZyhgICAke2luc3RhbmNlLmluc3RhbmNlSWR9IC0gJHtjd2R9IC0gJHtpc0ZvcmVncm91bmQgPyAnZm9yZWdyb3VuZCcgOiAnYmFja2dyb3VuZCd9YCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc2hvd0FsbFRlcm1pbmFscygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5pbnN0YW5jZXMpIHtcblx0XHRcdGlmICghdGhpcy5fdGVybWluYWxTZXJ2aWNlLmZvcmVncm91bmRJbnN0YW5jZXMuaW5jbHVkZXMoaW5zdGFuY2UpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zaG93QmFja2dyb3VuZFRlcm1pbmFsKGluc3RhbmNlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1Nlc3Npb25zVGVybWluYWxdIE1vdmVkIHRlcm1pbmFsICR7aW5zdGFuY2UuaW5zdGFuY2VJZH0gdG8gZm9yZWdyb3VuZGApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoU2Vzc2lvbnNUZXJtaW5hbENvbnRyaWJ1dGlvbi5JRCwgU2Vzc2lvbnNUZXJtaW5hbENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIHtAbGluayBBZ2VudEhvc3RTZXNzaW9uVGFza1J1bm5lcn0gd2l0aCB0aGVcbiAqIHtAbGluayBJU2Vzc2lvblRhc2tSdW5uZXJSZWdpc3RyeX0uIExpdmVzIG5leHQgdG8gdGhlIG90aGVyIGFnZW50LWhvc3RcbiAqIHRlcm1pbmFsIHdpcmluZyBzbyB0aGF0IHRoZSBydW5uZXIgaXMgcmVtb3ZlZCB0b2dldGhlciB3aXRoIHRoZSByZXN0IG9mXG4gKiB0aGUgc2Vzc2lvbnMgdGVybWluYWwgY29udHJpYnV0aW9uIGlmIHRoZSBhZ2VudHMgYXBwIHNodXRzIGRvd24uXG4gKi9cbmNsYXNzIFJlZ2lzdGVyQWdlbnRIb3N0U2Vzc2lvblRhc2tSdW5uZXJDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnNlc3Npb25zLnJlZ2lzdGVyQWdlbnRIb3N0VGFza1J1bm5lcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvblRhc2tSdW5uZXJSZWdpc3RyeSByZWdpc3RyeTogSVNlc3Npb25UYXNrUnVubmVyUmVnaXN0cnksXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgcnVubmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0U2Vzc2lvblRhc2tSdW5uZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdHJ5LnJlZ2lzdGVyKHJ1bm5lcikpO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihSZWdpc3RlckFnZW50SG9zdFNlc3Npb25UYXNrUnVubmVyQ29udHJpYnV0aW9uLklELCBSZWdpc3RlckFnZW50SG9zdFNlc3Npb25UYXNrUnVubmVyQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xuXG5jbGFzcyBPcGVuU2Vzc2lvbkluVGVybWluYWxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2FnZW50U2Vzc2lvbi5vcGVuSW5UZXJtaW5hbCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuSW5UZXJtaW5hbCcsIFwiT3BlbiBUZXJtaW5hbFwiKSxcblx0XHRcdGljb246IENvZGljb24udGVybWluYWwsXG5cdFx0XHQvLyBUaGUgcGFuZWwgaXMgaGlkZGVuIHdoaWxlIGEgY3VzdG9tIHZpZXcgcmVwbGFjZXMgdGhlIHNlc3Npb25zIGdyaWQuXG5cdFx0XHRwcmVjb25kaXRpb246IEN1c3RvbVZpZXdWaXNpYmxlQ29udGV4dC5uZWdhdGUoKSxcblx0XHRcdHRvZ2dsZWQ6IHtcblx0XHRcdFx0Y29uZGl0aW9uOiBTZXNzaW9uc1Rlcm1pbmFsVmlld1Zpc2libGVDb250ZXh0LFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2hpZGVUZXJtaW5hbCcsIFwiSGlkZSBUZXJtaW5hbFwiKSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudXMuVGl0bGVCYXJTZXNzaW9uTWVudSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLCBTZXNzaW9uc1dlbGNvbWVWaXNpYmxlQ29udGV4dC50b05lZ2F0ZWQoKSwgSXNQaG9uZUxheW91dENvbnRleHQubmVnYXRlKCkpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gX2FjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0bG9nU2Vzc2lvbnNJbnRlcmFjdGlvbih0ZWxlbWV0cnlTZXJ2aWNlLCAnb3BlblRlcm1pbmFsJyk7XG5cblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gX2FjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gX2FjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblxuXHRcdC8vIFRvZ2dsZTogaWYgcGFuZWwgaXMgdmlzaWJsZSBhbmQgdGhlIHRlcm1pbmFsIHZpZXcgaXMgYWN0aXZlLCBoaWRlIGl0LlxuXHRcdC8vIElmIHRoZSBwYW5lbCBpcyB2aXNpYmxlIGJ1dCBzaG93aW5nIGFub3RoZXIgdmlldywgb3BlbiB0aGUgdGVybWluYWwgaW5zdGVhZC5cblx0XHRpZiAobGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCkpIHtcblx0XHRcdGlmICh2aWV3c1NlcnZpY2UuaXNWaWV3VmlzaWJsZShURVJNSU5BTF9WSUVXX0lEKSkge1xuXHRcdFx0XHRsYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgUGFydHMuUEFORUxfUEFSVCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSBnZXRXb3JrYmVuY2hDb250cmlidXRpb248U2Vzc2lvbnNUZXJtaW5hbENvbnRyaWJ1dGlvbj4oU2Vzc2lvbnNUZXJtaW5hbENvbnRyaWJ1dGlvbi5JRCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gX2FjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCBwYXRoU2VydmljZSA9IF9hY2Nlc3Nvci5nZXQoSVBhdGhTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRjb25zdCBpbmZvID0gZ2V0U2Vzc2lvblRlcm1pbmFsSW5mbyhhY3RpdmVTZXNzaW9uKTtcblx0XHRjb25zdCBjd2QgPSBpbmZvPy5jd2QgPz8gYXdhaXQgcGF0aFNlcnZpY2UudXNlckhvbWUoKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoY3dkLCB0cnVlLCBhY3RpdmVTZXNzaW9uKTtcblx0XHR2aWV3c1NlcnZpY2Uub3BlblZpZXcoVEVSTUlOQUxfVklFV19JRCk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKE9wZW5TZXNzaW9uSW5UZXJtaW5hbEFjdGlvbik7XG5cbmNsYXNzIER1bXBUZXJtaW5hbFRyYWNraW5nQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudFNlc3Npb24uZHVtcFRlcm1pbmFsVHJhY2tpbmcnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZHVtcFRlcm1pbmFsVHJhY2tpbmcnLCBcIkR1bXAgVGVybWluYWwgVHJhY2tpbmdcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250cmlidXRpb24gPSBnZXRXb3JrYmVuY2hDb250cmlidXRpb248U2Vzc2lvbnNUZXJtaW5hbENvbnRyaWJ1dGlvbj4oU2Vzc2lvbnNUZXJtaW5hbENvbnRyaWJ1dGlvbi5JRCk7XG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmR1bXBUcmFja2luZygpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihEdW1wVGVybWluYWxUcmFja2luZ0FjdGlvbik7XG5cbmNsYXNzIFNob3dBbGxUZXJtaW5hbHNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2FnZW50U2Vzc2lvbi5zaG93QWxsVGVybWluYWxzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3dBbGxUZXJtaW5hbHMnLCBcIlNob3cgQWxsIFRlcm1pbmFsc1wiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IGdldFdvcmtiZW5jaENvbnRyaWJ1dGlvbjxTZXNzaW9uc1Rlcm1pbmFsQ29udHJpYnV0aW9uPihTZXNzaW9uc1Rlcm1pbmFsQ29udHJpYnV0aW9uLklEKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uc2hvd0FsbFRlcm1pbmFscygpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihTaG93QWxsVGVybWluYWxzQWN0aW9uKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyxlQUF3QjtBQUcxQyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyxtQkFBbUIsd0JBQXdCO0FBQ3BELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQWlDLDBCQUEwQixnQ0FBZ0Msc0JBQXNCO0FBQ2pILFNBQVMsaUNBQWlDO0FBQzFDLFNBQTRCLHdCQUF3QjtBQUNwRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxxQkFBcUIsb0NBQW9DO0FBQ2xFLFNBQVMsK0JBQStCLHNCQUFzQixnQ0FBZ0M7QUFDOUYsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQkFBZ0Isb0JBQW9CLHFCQUFxQjtBQUNsRSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHlCQUF5Qix3QkFBd0I7QUFDMUQsU0FBUyx5QkFBeUIsYUFBYTtBQUMvQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGtDQUFrQztBQUUzQyxNQUFNLHFDQUFxQyxJQUFJLGNBQXVCLCtCQUErQixLQUFLO0FBbUIxRyxTQUFTLHVCQUF1QixTQUErQixRQUFvRDtBQUNsSCxNQUFJLENBQUMsU0FBUztBQUNiLFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxZQUFZLFNBQVMsUUFBUSxVQUFVLEtBQUssTUFBTSxJQUFJLFFBQVEsVUFBVSxJQUFJO0FBQ2xGLE1BQUksV0FBVyx1QkFBdUIsT0FBTztBQUM1QyxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sU0FBUyxVQUFVLFFBQVEsQ0FBQztBQUNsQyxRQUFNLE1BQU0sUUFBUTtBQUNwQixNQUFJLENBQUMsS0FBSztBQUNULFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxJQUFJLFdBQVcsbUJBQW1CO0FBQ3JDLFdBQU8sRUFBRSxLQUFLLGlCQUFpQixHQUFHLEdBQUcsY0FBYyxJQUFJO0FBQUEsRUFDeEQ7QUFDQSxTQUFPLEVBQUUsSUFBSTtBQUNkO0FBV08sSUFBTSwrQkFBTixjQUEyQyxXQUE2QztBQUFBLEVBb0I5RixZQUM4Qyw0QkFDVixrQkFDUywyQkFDVCxrQkFDUywyQkFDZCxhQUNDLGNBQ1cseUJBQzNCLGNBQ0ssbUJBQ25CO0FBQ0QsVUFBTTtBQVh1QztBQUNWO0FBQ1M7QUFDVDtBQUNTO0FBQ2Q7QUFDQztBQUNXO0FBdEIzQyxTQUFpQixvQkFBb0Isb0JBQUksSUFBeUI7QUFDbEUsU0FBaUIseUJBQXlCLG9CQUFJLElBQVk7QUFFMUQ7QUFBQSxTQUFpQiw2QkFBNkIsb0JBQUksSUFBdUM7QUFTekY7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixzQkFBc0Isb0JBQUksSUFBWTtBQW1CdEQsZUFBVyxXQUFXLEtBQUssMkJBQTJCLFlBQVksR0FBRztBQUNwRSxVQUFJLFFBQVEsV0FBVyxJQUFJLEdBQUc7QUFDN0IsYUFBSyxvQkFBb0IsSUFBSSxRQUFRLFNBQVM7QUFBQSxNQUMvQztBQUFBLElBQ0Q7QUFFQSxVQUFNLGtCQUFrQixRQUFRLFlBQVU7QUFDekMsWUFBTSxVQUFVLEtBQUssaUJBQWlCLGNBQWMsS0FBSyxNQUFNO0FBQy9ELFVBQUksQ0FBQyxXQUFXLFFBQVEsZUFBZSw4QkFBOEI7QUFDcEU7QUFBQSxNQUNEO0FBRUEsWUFBTSxVQUFVLEtBQUssNEJBQTRCLE9BQU87QUFDeEQsVUFBSSxDQUFDLFNBQVM7QUFDYjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFdBQVcsS0FBSywwQkFBMEIsU0FBUyxLQUFLLE1BQU07QUFDcEUsYUFBTyxTQUFTLEtBQUssT0FBSyxFQUFFLFlBQVksT0FBTyxLQUFLLEtBQUssMEJBQTBCLHdCQUF3QixPQUFPO0FBQUEsSUFDbkgsQ0FBQztBQUVELFNBQUssVUFBVSxRQUFRLFlBQVU7QUFDaEMsWUFBTSxVQUFVLGdCQUFnQixLQUFLLE1BQU07QUFDM0MsVUFBSSxTQUFTO0FBQ1osZUFBTyxNQUFNLElBQUksS0FBSyx3QkFBd0I7QUFBQSxVQUM3QyxRQUFRO0FBQUEsVUFBcUIsUUFBUTtBQUFBLFFBQ3RDLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFLRixTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFlBQU0sVUFBVSxLQUFLLGlCQUFpQixjQUFjLEtBQUssTUFBTTtBQUMvRCxVQUFJLFNBQVMsUUFBUSxLQUFLLE1BQU0sR0FBRztBQUNsQyxhQUFLLDBCQUEwQixjQUFjLE1BQVM7QUFDdEQ7QUFBQSxNQUNEO0FBQ0EsWUFBTSxPQUFPLHVCQUF1QixTQUFTLE1BQU07QUFDbkQsV0FBSywwQkFBMEIsY0FBYyxNQUFNLEdBQUc7QUFBQSxJQUN2RCxDQUFDLENBQUM7QUFJRixVQUFNLHNCQUFzQixtQ0FBbUMsT0FBTyxpQkFBaUI7QUFDdkYsd0JBQW9CLElBQUksYUFBYSxjQUFjLGdCQUFnQixDQUFDO0FBQ3BFLFNBQUssVUFBVSxhQUFhLDBCQUEwQixPQUFLO0FBQzFELFVBQUksRUFBRSxPQUFPLGtCQUFrQjtBQUM5Qiw0QkFBb0IsSUFBSSxFQUFFLE9BQU87QUFBQSxNQUNsQztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsU0FBSyxVQUFVLFFBQVEsWUFBVTtBQUNoQyxZQUFNLFVBQVUsS0FBSyxpQkFBaUIsY0FBYyxLQUFLLE1BQU07QUFDL0QsVUFBSSxTQUFTLFFBQVEsS0FBSyxNQUFNLEdBQUc7QUFDbEMsYUFBSyxhQUFhO0FBQ2xCLGFBQUssbUJBQW1CO0FBQ3hCO0FBQUEsTUFDRDtBQUNBLFdBQUssd0JBQXdCLE9BQU87QUFBQSxJQUNyQyxDQUFDLENBQUM7QUFJRixTQUFLLFVBQVUsS0FBSywyQkFBMkIsNEJBQTRCLENBQUMsRUFBRSxNQUFNLEdBQUcsTUFBTTtBQUM1RixXQUFLLDZCQUE2QixNQUFNLEVBQUU7QUFBQSxJQUMzQyxDQUFDLENBQUM7QUFLRixTQUFLLFVBQVUsS0FBSywyQkFBMkIsb0JBQW9CLENBQUMsRUFBRSxNQUFNLEdBQUcsTUFBTTtBQUNwRixXQUFLLG1CQUFtQixLQUFLLFdBQVcsR0FBRyxTQUFTO0FBQUEsSUFDckQsQ0FBQyxDQUFDO0FBSUYsU0FBSyxVQUFVLEtBQUssaUJBQWlCLHFCQUFxQixjQUFZO0FBQ3JFLFdBQUssbUNBQW1DLFNBQVMsVUFBVTtBQUMzRCxXQUFLLHVCQUF1QixPQUFPLFNBQVMsVUFBVTtBQUFBLElBQ3ZELENBQUMsQ0FBQztBQUtGLFNBQUssVUFBVSxLQUFLLGlCQUFpQixvQkFBb0IsY0FBWTtBQUVwRSxVQUFJLFNBQVMsa0JBQWtCLGNBQWM7QUFDNUM7QUFBQSxNQUNEO0FBQ0EsVUFBSSxTQUFTLGtCQUFrQiwyQkFBMkIsS0FBSyxZQUFZO0FBQzFFLGlCQUFTLGNBQWMsRUFBRSxLQUFLLFNBQU87QUFDcEMsY0FBSSxJQUFJLFlBQVksTUFBTSxLQUFLLFlBQVk7QUFDMUMsa0JBQU0sb0JBQW9CLEtBQUssc0JBQXNCLFVBQVUsOEJBQThCLEdBQUcsRUFBRTtBQUNsRyxnQkFBSSxDQUFDLG1CQUFtQjtBQUN2QjtBQUFBLFlBQ0Q7QUFDQSxpQkFBSyxpQkFBaUIsaUJBQWlCLGlCQUFpQjtBQUN4RCxpQkFBSyxZQUFZLE1BQU0sNENBQTRDLGtCQUFrQixVQUFVLFVBQVUsR0FBRyxHQUFHO0FBQUEsVUFDaEg7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDLENBQUM7QUF3QkYsU0FBSyxVQUFVLEtBQUssMkJBQTJCLG9CQUFvQixPQUFLO0FBTXZFLGlCQUFXLFdBQVcsRUFBRSxPQUFPO0FBQzlCLFlBQUksUUFBUSxXQUFXLElBQUksR0FBRztBQUM3QixlQUFLLG9CQUFvQixJQUFJLFFBQVEsU0FBUztBQUFBLFFBQy9DO0FBQUEsTUFDRDtBQUNBLFlBQU0sZUFBMkIsQ0FBQztBQUNsQyxpQkFBVyxXQUFXLEVBQUUsU0FBUztBQUNoQyxZQUFJLFFBQVEsV0FBVyxJQUFJLEdBQUc7QUFDN0IsY0FBSSxDQUFDLEtBQUssb0JBQW9CLElBQUksUUFBUSxTQUFTLEdBQUc7QUFDckQsaUJBQUssb0JBQW9CLElBQUksUUFBUSxTQUFTO0FBQzlDLHlCQUFhLEtBQUssT0FBTztBQUFBLFVBQzFCO0FBQUEsUUFDRCxPQUFPO0FBQ04sZUFBSyxvQkFBb0IsT0FBTyxRQUFRLFNBQVM7QUFBQSxRQUNsRDtBQUFBLE1BQ0Q7QUFDQSxpQkFBVyxXQUFXLEVBQUUsU0FBUztBQUNoQyxhQUFLLG9CQUFvQixPQUFPLFFBQVEsU0FBUztBQUFBLE1BQ2xEO0FBQ0EsVUFBSSxFQUFFLFFBQVEsV0FBVyxLQUFLLGFBQWEsV0FBVyxHQUFHO0FBQ3hEO0FBQUEsTUFDRDtBQUNBLFdBQUssWUFBWSxNQUFNLDREQUE0RCxFQUFFLFFBQVEsTUFBTSxtQkFBbUIsYUFBYSxNQUFNLHNCQUFzQixLQUFLLGtCQUFrQixJQUFJLGdCQUFnQixLQUFLLGNBQWMsUUFBUSxHQUFHO0FBQ3hPLGlCQUFXLFdBQVcsRUFBRSxTQUFTO0FBQ2hDLGFBQUssS0FBSywwQkFBMEIsUUFBUSxXQUFXLG9CQUFvQixRQUFRLFNBQVMsR0FBRyxFQUFFLFFBQVEsTUFBTSxLQUFLLGtCQUFrQixPQUFPLFFBQVEsU0FBUyxDQUFDO0FBQUEsTUFDaEs7QUFDQSxpQkFBVyxXQUFXLGNBQWM7QUFDbkMsYUFBSyxLQUFLLHlCQUF5QixRQUFRLFdBQVcscUJBQXFCLFFBQVEsU0FBUyxHQUFHO0FBQUEsTUFDaEc7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBWUEsTUFBTSxlQUFlLEtBQVUsT0FBZ0IsU0FBa0Q7QUFDaEcsUUFBSSxDQUFDLFNBQVM7QUFDYixhQUFPLEtBQUssZ0JBQWdCLEtBQUssT0FBTyxPQUFPO0FBQUEsSUFDaEQ7QUFFQSxTQUFLLHdCQUF3QixRQUFRLFNBQVM7QUFDOUMsUUFBSTtBQUNILGFBQU8sTUFBTSxLQUFLLGdCQUFnQixLQUFLLE9BQU8sT0FBTztBQUFBLElBQ3RELFVBQUU7QUFDRCxXQUFLLHNCQUFzQixRQUFRLFNBQVM7QUFBQSxJQUM3QztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsZ0JBQWdCLEtBQVUsT0FBZ0IsU0FBa0Q7QUFDekcsUUFBSSxXQUFXLEtBQUssMkJBQTJCLElBQUksUUFBUSxTQUFTLEdBQUcsVUFBVTtBQUNoRixhQUFPLENBQUM7QUFBQSxJQUNUO0FBRUEsVUFBTSxNQUFNLElBQUksT0FBTyxZQUFZO0FBQ25DLFFBQUksV0FBVyxVQUFVLEtBQUssK0JBQStCLFFBQVEsU0FBUyxJQUFJLENBQUM7QUFDbkYsUUFBSSxTQUFTLFdBQVcsR0FBRztBQUMxQixpQkFBVyxNQUFNLEtBQUsscUJBQXFCLEtBQUssRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLFFBQVEsQ0FBQztBQUM3RSxVQUFJLFdBQVcsS0FBSywyQkFBMkIsSUFBSSxRQUFRLFNBQVMsR0FBRyxVQUFVO0FBQ2hGLGVBQU8sQ0FBQztBQUFBLE1BQ1Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxTQUFTLFdBQVcsR0FBRztBQUMxQixVQUFJO0FBQ0gsY0FBTSxXQUFXLE1BQU0sS0FBSywwQkFBMEIsS0FBSyxPQUFPO0FBQ2xFLGNBQU0sa0JBQWtCLEtBQUssc0JBQXNCLFVBQVUsaUNBQWlDLElBQUksTUFBTSxFQUFFO0FBQzFHLFlBQUksQ0FBQyxpQkFBaUI7QUFDckIsaUJBQU8sQ0FBQztBQUFBLFFBQ1Q7QUFDQSxZQUFJLFdBQVcsS0FBSywyQkFBMkIsSUFBSSxRQUFRLFNBQVMsR0FBRyxVQUFVO0FBQ2hGLGdCQUFNLEtBQUssaUJBQWlCLG9CQUFvQixlQUFlO0FBQy9ELGlCQUFPLENBQUM7QUFBQSxRQUNUO0FBQ0EsbUJBQVcsQ0FBQyxlQUFlO0FBQzNCLGFBQUssaUJBQWlCLGtCQUFrQixlQUFlO0FBQ3ZELGFBQUssWUFBWSxNQUFNLHVDQUF1QyxnQkFBZ0IsVUFBVSxRQUFRLElBQUksTUFBTSxFQUFFO0FBQUEsTUFDN0csU0FBUyxHQUFHO0FBQ1gsYUFBSyxZQUFZLE1BQU0saURBQWlELElBQUksTUFBTSxLQUFLLENBQUMsRUFBRTtBQUMxRixlQUFPLENBQUM7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUVBLFFBQUksU0FBUztBQUNaLFdBQUssMEJBQTBCLFFBQVEsV0FBVyxRQUFRO0FBQUEsSUFDM0Q7QUFFQSxRQUFJLE9BQU87QUFDVixZQUFNLEtBQUssaUJBQWlCLG9CQUFvQjtBQUFBLElBQ2pEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsTUFBYywwQkFBMEIsS0FBVSxTQUEyRDtBQUM1RyxVQUFNLFVBQVUsV0FBVyxLQUFLLDRCQUE0QixPQUFPO0FBQ25FLFFBQUksU0FBUztBQUNaLFlBQU0sV0FBVyxNQUFNLEtBQUssMEJBQTBCLHVCQUF1QixTQUFTLEVBQUUsSUFBSSxDQUFDO0FBQzdGLFVBQUksVUFBVTtBQUNiLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU8sS0FBSyxpQkFBaUIsZUFBZSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQztBQUFBLEVBQ2hFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLDRCQUE0QixTQUFtRDtBQUN0RixRQUFJLENBQUMsU0FBUztBQUNiLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxXQUFXLEtBQUssMEJBQTBCLFlBQVksUUFBUSxVQUFVO0FBQzlFLFFBQUksQ0FBQyxZQUFZLENBQUMsb0JBQW9CLFFBQVEsR0FBRztBQUNoRCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sU0FBUyxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsTUFBYyx3QkFBd0IsU0FBOEM7QUFDbkYsUUFBSSxDQUFDLFNBQVM7QUFDYjtBQUFBLElBQ0Q7QUFFQSxTQUFLLHdCQUF3QixRQUFRLFNBQVM7QUFDOUMsUUFBSTtBQUNILFlBQU0sT0FBTyx1QkFBdUIsT0FBTztBQUMzQyxZQUFNLGFBQWEsTUFBTSxPQUFPLE1BQU0sS0FBSyxhQUFhLFNBQVM7QUFDakUsWUFBTSxZQUFZLFdBQVcsT0FBTyxZQUFZO0FBQ2hELFVBQUksS0FBSyxlQUFlLGFBQWEsS0FBSyxxQkFBcUIsUUFBUSxXQUFXO0FBQ2pGO0FBQUEsTUFDRDtBQUNBLFdBQUssYUFBYTtBQUNsQixXQUFLLG1CQUFtQixRQUFRO0FBRWhDLFlBQU0sWUFBWSxNQUFNLEtBQUssZ0JBQWdCLFlBQVksT0FBTyxPQUFPO0FBSXZFLFVBQUksS0FBSyxlQUFlLGFBQWEsS0FBSyxxQkFBcUIsUUFBUSxXQUFXO0FBQ2pGO0FBQUEsTUFDRDtBQUNBLFlBQU0sS0FBSywwQkFBMEIsU0FBUyxXQUFXLFVBQVUsSUFBSSxjQUFZLFNBQVMsVUFBVSxDQUFDO0FBQUEsSUFDeEcsVUFBRTtBQUNELFdBQUssc0JBQXNCLFFBQVEsU0FBUztBQUFBLElBQzdDO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxNQUFjLHFCQUFxQixLQUFhLFNBQXNFO0FBQ3JILFVBQU0sU0FBOEIsQ0FBQztBQUNyQyxlQUFXLFlBQVksS0FBSyxpQkFBaUIsV0FBVztBQUV2RCxVQUFJLFNBQVMsa0JBQWtCLGNBQWM7QUFDNUM7QUFBQSxNQUNEO0FBQ0EsVUFBSSxTQUFTLG1CQUFtQixLQUFLLG1CQUFtQixTQUFTLFVBQVUsS0FBSyxLQUFLLHVCQUF1QixJQUFJLFNBQVMsVUFBVSxJQUFJO0FBQ3RJO0FBQUEsTUFDRDtBQUNBLFVBQUk7QUFDSCxjQUFNLE1BQU0sTUFBTSxTQUFTLGNBQWM7QUFDekMsWUFBSSxJQUFJLFlBQVksTUFBTSxLQUFLO0FBQzlCLGlCQUFPLEtBQUssUUFBUTtBQUFBLFFBQ3JCO0FBQUEsTUFDRCxRQUFRO0FBQUEsTUFFUjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsMEJBQTBCLFdBQW1CLFdBQStDO0FBQ25HLFFBQUksVUFBVSxXQUFXLEdBQUc7QUFDM0I7QUFBQSxJQUNEO0FBQ0EsUUFBSSxjQUFjLEtBQUssa0JBQWtCLElBQUksU0FBUztBQUN0RCxRQUFJLENBQUMsYUFBYTtBQUNqQixvQkFBYyxvQkFBSSxJQUFZO0FBQzlCLFdBQUssa0JBQWtCLElBQUksV0FBVyxXQUFXO0FBQUEsSUFDbEQ7QUFDQSxlQUFXLFlBQVksV0FBVztBQUNqQyxrQkFBWSxJQUFJLFNBQVMsVUFBVTtBQUFBLElBQ3BDO0FBQUEsRUFDRDtBQUFBLEVBRVEsd0JBQXdCLFdBQXlCO0FBQ3hELFVBQU0sWUFBWSxLQUFLLDJCQUEyQixJQUFJLFNBQVM7QUFDL0QsUUFBSSxXQUFXO0FBQ2QsZ0JBQVU7QUFDVjtBQUFBLElBQ0Q7QUFDQSxTQUFLLDJCQUEyQixJQUFJLFdBQVcsRUFBRSxPQUFPLEdBQUcsVUFBVSxNQUFNLENBQUM7QUFBQSxFQUM3RTtBQUFBLEVBRVEsc0JBQXNCLFdBQXlCO0FBQ3RELFVBQU0sWUFBWSxLQUFLLDJCQUEyQixJQUFJLFNBQVM7QUFDL0QsUUFBSSxDQUFDLFdBQVc7QUFDZjtBQUFBLElBQ0Q7QUFDQSxjQUFVO0FBQ1YsUUFBSSxVQUFVLFFBQVEsR0FBRztBQUN4QjtBQUFBLElBQ0Q7QUFDQSxTQUFLLDJCQUEyQixPQUFPLFNBQVM7QUFBQSxFQUNqRDtBQUFBLEVBRVEsNkJBQTZCLE1BQWdCLElBQW9CO0FBQ3hFLFVBQU0sbUJBQW1CLEtBQUssMkJBQTJCLElBQUksS0FBSyxTQUFTO0FBQzNFLFFBQUksa0JBQWtCO0FBQ3JCLHVCQUFpQixXQUFXO0FBQUEsSUFDN0I7QUFFQSxVQUFNLFVBQVUsdUJBQXVCLElBQUksR0FBRyxJQUFJLE9BQU8sWUFBWTtBQUNyRSxVQUFNLFFBQVEsdUJBQXVCLEVBQUUsR0FBRyxJQUFJLE9BQU8sWUFBWTtBQUNqRSxVQUFNLHVCQUF1QixLQUFLLDRCQUE0QixJQUFJO0FBQ2xFLFVBQU0scUJBQXFCLEtBQUssNEJBQTRCLEVBQUU7QUFDOUQsUUFBSSxZQUFZLFNBQVMseUJBQXlCLG9CQUFvQjtBQUNyRSxXQUFLLG1CQUFtQixLQUFLLFdBQVcsR0FBRyxTQUFTO0FBQUEsSUFDckQsT0FBTztBQUNOLFdBQUssaUJBQWlCLEtBQUssU0FBUztBQUFBLElBQ3JDO0FBQUEsRUFDRDtBQUFBLEVBRVEsaUJBQWlCLFdBQXlCO0FBQ2pELFVBQU0sWUFBWSxLQUFLLCtCQUErQixTQUFTO0FBQy9ELGVBQVcsWUFBWSxXQUFXO0FBQ2pDLFdBQUssdUJBQXVCLElBQUksU0FBUyxVQUFVO0FBQUEsSUFDcEQ7QUFDQSxRQUFJLFVBQVUsU0FBUyxHQUFHO0FBQ3pCLFdBQUssWUFBWSxNQUFNLDhCQUE4QixVQUFVLE1BQU0sNkJBQTZCLFNBQVMsRUFBRTtBQUFBLElBQzlHO0FBQ0EsU0FBSyxrQkFBa0IsT0FBTyxTQUFTO0FBQUEsRUFDeEM7QUFBQSxFQUVRLG1CQUFtQixlQUF1QixhQUEyQjtBQUM1RSxVQUFNLGNBQWMsS0FBSyxrQkFBa0IsSUFBSSxhQUFhO0FBQzVELFFBQUksZUFBZSxZQUFZLE9BQU8sR0FBRztBQUN4QyxVQUFJLFlBQVksS0FBSyxrQkFBa0IsSUFBSSxXQUFXO0FBQ3RELFVBQUksQ0FBQyxXQUFXO0FBQ2Ysb0JBQVksb0JBQUksSUFBWTtBQUM1QixhQUFLLGtCQUFrQixJQUFJLGFBQWEsU0FBUztBQUFBLE1BQ2xEO0FBQ0EsaUJBQVcsTUFBTSxhQUFhO0FBQzdCLGtCQUFVLElBQUksRUFBRTtBQUFBLE1BQ2pCO0FBQ0EsV0FBSyxZQUFZLE1BQU0sa0NBQWtDLFlBQVksSUFBSSw2QkFBNkIsYUFBYSxPQUFPLFdBQVcsRUFBRTtBQUFBLElBQ3hJO0FBQ0EsU0FBSyxrQkFBa0IsT0FBTyxhQUFhO0FBQUEsRUFDNUM7QUFBQSxFQUVRLCtCQUErQixXQUF3QztBQUM5RSxVQUFNLGNBQWMsS0FBSyxrQkFBa0IsSUFBSSxTQUFTO0FBQ3hELFFBQUksQ0FBQyxhQUFhO0FBQ2pCLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFFQSxVQUFNLFNBQThCLENBQUM7QUFDckMsZUFBVyxjQUFjLENBQUMsR0FBRyxXQUFXLEdBQUc7QUFDMUMsWUFBTSxXQUFXLEtBQUssaUJBQWlCLGtCQUFrQixVQUFVO0FBQ25FLFVBQUksQ0FBQyxZQUFZLFNBQVMsY0FBYyxTQUFTLGtCQUFrQixjQUFjO0FBQ2hGLG9CQUFZLE9BQU8sVUFBVTtBQUM3QjtBQUFBLE1BQ0Q7QUFDQSxhQUFPLEtBQUssUUFBUTtBQUFBLElBQ3JCO0FBRUEsUUFBSSxZQUFZLFNBQVMsR0FBRztBQUMzQixXQUFLLGtCQUFrQixPQUFPLFNBQVM7QUFBQSxJQUN4QztBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxtQkFBbUIsWUFBNkI7QUFDdkQsZUFBVyxDQUFDLFdBQVcsV0FBVyxLQUFLLEtBQUssbUJBQW1CO0FBQzlELFVBQUksWUFBWSxJQUFJLFVBQVUsR0FBRztBQUNoQyxjQUFNLFdBQVcsS0FBSyxpQkFBaUIsa0JBQWtCLFVBQVU7QUFDbkUsWUFBSSxDQUFDLFlBQVksU0FBUyxZQUFZO0FBQ3JDLHNCQUFZLE9BQU8sVUFBVTtBQUM3QixjQUFJLFlBQVksU0FBUyxHQUFHO0FBQzNCLGlCQUFLLGtCQUFrQixPQUFPLFNBQVM7QUFBQSxVQUN4QztBQUNBO0FBQUEsUUFDRDtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxtQ0FBbUMsWUFBMEI7QUFDcEUsZUFBVyxDQUFDLFdBQVcsV0FBVyxLQUFLLEtBQUssbUJBQW1CO0FBQzlELGtCQUFZLE9BQU8sVUFBVTtBQUM3QixVQUFJLFlBQVksU0FBUyxHQUFHO0FBQzNCLGFBQUssa0JBQWtCLE9BQU8sU0FBUztBQUFBLE1BQ3hDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHNCQUFzQixVQUE2QixRQUErQztBQUN6RyxVQUFNLGtCQUFrQixLQUFLLGlCQUFpQixrQkFBa0IsU0FBUyxVQUFVO0FBQ25GLFFBQUksQ0FBQyxtQkFBbUIsZ0JBQWdCLFlBQVk7QUFDbkQsV0FBSyxZQUFZLE1BQU0sNkJBQTZCLE1BQU0sY0FBYyxTQUFTLFVBQVUseUJBQXlCO0FBQ3BILGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFBLE1BQWMsMEJBQTBCLGVBQXlCLFdBQW1CLDRCQUFxRDtBQUN4SSxVQUFNLFNBQThCLENBQUM7QUFDckMsVUFBTSxTQUE4QixDQUFDO0FBQ3JDLFVBQU0scUJBQXFCLElBQUksSUFBSSxLQUFLLCtCQUErQixjQUFjLFNBQVMsRUFBRSxJQUFJLGNBQVksU0FBUyxVQUFVLENBQUM7QUFFcEksZUFBVyxZQUFZLENBQUMsR0FBRyxLQUFLLGlCQUFpQixTQUFTLEdBQUc7QUFFNUQsVUFBSSxTQUFTLGtCQUFrQixnQkFBZ0IsS0FBSyx1QkFBdUIsSUFBSSxTQUFTLFVBQVUsR0FBRztBQUNwRztBQUFBLE1BQ0Q7QUFDQSxVQUFJO0FBQ0osWUFBTSxrQkFBa0IsS0FBSyxzQkFBc0IsVUFBVSw0QkFBNEI7QUFDekYsVUFBSSxDQUFDLGlCQUFpQjtBQUNyQjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLGVBQWUsS0FBSyxpQkFBaUIsb0JBQW9CLFNBQVMsZUFBZTtBQUN2RixZQUFNLGlCQUFpQiwyQkFBMkIsU0FBUyxnQkFBZ0IsVUFBVTtBQUNyRixVQUFJLHlCQUF5QixtQkFBbUIsSUFBSSxnQkFBZ0IsVUFBVTtBQUM5RSxVQUFJLENBQUMsMEJBQTBCLENBQUMsS0FBSyxtQkFBbUIsZ0JBQWdCLFVBQVUsR0FBRztBQUlwRixZQUFJO0FBQ0gsaUJBQU8sTUFBTSxnQkFBZ0IsY0FBYyxHQUFHLFlBQVk7QUFBQSxRQUMzRCxRQUFRO0FBQ1A7QUFBQSxRQUNEO0FBQ0EsaUNBQXlCLFFBQVE7QUFBQSxNQUNsQztBQUNBLFdBQUssMEJBQTBCLG1CQUFtQixDQUFDLGNBQWM7QUFDaEUsZUFBTyxLQUFLLGVBQWU7QUFBQSxNQUM1QixXQUFXLENBQUMsMEJBQTBCLENBQUMsa0JBQWtCLGNBQWM7QUFDdEUsZUFBTyxLQUFLLGVBQWU7QUFBQSxNQUM1QjtBQUFBLElBQ0Q7QUFFQSxlQUFXLFlBQVksUUFBUTtBQUM5QixZQUFNLG9CQUFvQixLQUFLLHNCQUFzQixVQUFVLDBCQUEwQjtBQUN6RixVQUFJLG1CQUFtQjtBQUN0QixjQUFNLEtBQUssaUJBQWlCLHVCQUF1QixtQkFBbUIsSUFBSTtBQUFBLE1BQzNFO0FBQUEsSUFDRDtBQUNBLGVBQVcsWUFBWSxRQUFRO0FBQzlCLFlBQU0sb0JBQW9CLEtBQUssc0JBQXNCLFVBQVUsNkJBQTZCO0FBQzVGLFVBQUksbUJBQW1CO0FBQ3RCLGFBQUssWUFBWSxNQUFNLHNDQUFzQyxrQkFBa0IsVUFBVSxtQ0FBbUMsU0FBUyxHQUFHO0FBQ3hJLGFBQUssaUJBQWlCLGlCQUFpQixpQkFBaUI7QUFBQSxNQUN6RDtBQUFBLElBQ0Q7QUFHQSxVQUFNLGFBQWEsS0FBSyxpQkFBaUI7QUFDekMsUUFBSTtBQUNKLFFBQUksc0JBQXNCO0FBQzFCLGVBQVcsWUFBWSxZQUFZO0FBQ2xDLFVBQUksS0FBSyx1QkFBdUIsSUFBSSxTQUFTLFVBQVUsR0FBRztBQUN6RDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLGVBQWUsU0FBUyxhQUFhLElBQUksbUJBQW1CLGdCQUFnQjtBQUNsRixZQUFNLFVBQVUsY0FBYyxTQUFTLEdBQUcsRUFBRTtBQUM1QyxVQUFJLFdBQVcsUUFBUSxZQUFZLHFCQUFxQjtBQUN2RCw4QkFBc0IsUUFBUTtBQUM5QixxQkFBYTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBQ0EsUUFBSSxZQUFZO0FBQ2YsV0FBSyxpQkFBaUIsa0JBQWtCLFVBQVU7QUFBQSxJQUNuRDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBZUEsTUFBYywwQkFBMEIsV0FBbUIsUUFBK0I7QUFDekYsVUFBTSxzQkFBc0IsS0FBSyxpQkFBaUIsZ0JBQWdCO0FBQ2xFLGVBQVcsWUFBWSxLQUFLLCtCQUErQixTQUFTLEdBQUc7QUFDdEUsVUFBSSx3QkFBd0IsVUFBYSxTQUFTLGVBQWUscUJBQXFCO0FBQ3JGLGFBQUssWUFBWSxLQUFLLCtDQUErQyxTQUFTLFVBQVUsZ0JBQWdCLFNBQVMsMEJBQTBCO0FBQzNJO0FBQUEsTUFDRDtBQUNBLFlBQU0sb0JBQW9CLEtBQUssc0JBQXNCLFVBQVUsOENBQThDLFNBQVMsRUFBRTtBQUN4SCxVQUFJLENBQUMsbUJBQW1CO0FBQ3ZCO0FBQUEsTUFDRDtBQUNBLFdBQUssWUFBWSxLQUFLLHVDQUF1QyxrQkFBa0IsVUFBVSxjQUFjLFNBQVMsYUFBYSxNQUFNLEdBQUc7QUFDdEksWUFBTSxLQUFLLGlCQUFpQixvQkFBb0IsaUJBQWlCO0FBQ2pFLFdBQUssbUNBQW1DLGtCQUFrQixVQUFVO0FBQUEsSUFDckU7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWVBLE1BQWMseUJBQXlCLFdBQW1CLFFBQStCO0FBQ3hGLFVBQU0sc0JBQXNCLEtBQUssaUJBQWlCLGdCQUFnQjtBQUNsRSxlQUFXLFlBQVksS0FBSywrQkFBK0IsU0FBUyxHQUFHO0FBQ3RFLFVBQUksd0JBQXdCLFVBQWEsU0FBUyxlQUFlLHFCQUFxQjtBQUNyRixhQUFLLFlBQVksS0FBSywrQ0FBK0MsU0FBUyxVQUFVLGdCQUFnQixTQUFTLDBCQUEwQjtBQUMzSTtBQUFBLE1BQ0Q7QUFDQSxZQUFNLG9CQUFvQixLQUFLLHNCQUFzQixVQUFVLHNDQUFzQyxTQUFTLEVBQUU7QUFDaEgsVUFBSSxDQUFDLG1CQUFtQjtBQUN2QjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLFlBQVksS0FBSyxzQ0FBc0Msa0JBQWtCLFVBQVUsY0FBYyxTQUFTLGFBQWEsTUFBTSxHQUFHO0FBQ3JJLFdBQUssaUJBQWlCLGlCQUFpQixpQkFBaUI7QUFBQSxJQUN6RDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sZUFBOEI7QUFDbkMsWUFBUSxJQUFJLGtDQUFrQyxLQUFLLGNBQWMsUUFBUSxFQUFFO0FBQzNFLFlBQVEsSUFBSSx5Q0FBeUMsS0FBSyxVQUFVLENBQUMsR0FBRyxLQUFLLGtCQUFrQixRQUFRLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxXQUFXLFdBQVcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO0FBQzdLLFlBQVEsSUFBSSw0Q0FBNEMsS0FBSyxVQUFVLENBQUMsR0FBRyxLQUFLLHNCQUFzQixDQUFDLENBQUMsRUFBRTtBQUMxRyxZQUFRLElBQUksMENBQTBDO0FBQ3RELGVBQVcsWUFBWSxLQUFLLGlCQUFpQixXQUFXO0FBQ3ZELFVBQUksTUFBTTtBQUNWLFVBQUk7QUFBRSxjQUFNLE1BQU0sU0FBUyxjQUFjO0FBQUEsTUFBRyxRQUFRO0FBQUEsTUFBZ0I7QUFDcEUsWUFBTSxlQUFlLEtBQUssaUJBQWlCLG9CQUFvQixTQUFTLFFBQVE7QUFDaEYsY0FBUSxJQUFJLEtBQUssU0FBUyxVQUFVLE1BQU0sR0FBRyxNQUFNLGVBQWUsZUFBZSxZQUFZLEVBQUU7QUFBQSxJQUNoRztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sbUJBQWtDO0FBQ3ZDLGVBQVcsWUFBWSxLQUFLLGlCQUFpQixXQUFXO0FBQ3ZELFVBQUksQ0FBQyxLQUFLLGlCQUFpQixvQkFBb0IsU0FBUyxRQUFRLEdBQUc7QUFDbEUsY0FBTSxLQUFLLGlCQUFpQix1QkFBdUIsVUFBVSxJQUFJO0FBQ2pFLGFBQUssWUFBWSxNQUFNLHFDQUFxQyxTQUFTLFVBQVUsZ0JBQWdCO0FBQUEsTUFDaEc7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBMW9CYSw2QkFFSSxLQUFLO0FBRlQsK0JBQU47QUFBQSxFQXFCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBOUJVO0FBNG9CYiwrQkFBK0IsNkJBQTZCLElBQUksOEJBQThCLGVBQWUsYUFBYTtBQVExSCxJQUFNLGlEQUFOLGNBQTZELFdBQTZDO0FBQUEsRUFJekcsWUFDd0Isc0JBQ0ssVUFDM0I7QUFDRCxVQUFNO0FBQ04sVUFBTSxTQUFTLHFCQUFxQixlQUFlLDBCQUEwQjtBQUM3RSxTQUFLLFVBQVUsU0FBUyxTQUFTLE1BQU0sQ0FBQztBQUFBLEVBQ3pDO0FBQ0Q7QUFaTSwrQ0FFVyxLQUFLO0FBRmhCLGlEQUFOO0FBQUEsRUFLRztBQUFBLEVBQ0E7QUFBQSxHQU5HO0FBY04sK0JBQStCLCtDQUErQyxJQUFJLGdEQUFnRCxlQUFlLFlBQVk7QUFFN0osTUFBTSxvQ0FBb0MsUUFBUTtBQUFBLEVBRWpELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsa0JBQWtCLGVBQWU7QUFBQSxNQUNsRCxNQUFNLFFBQVE7QUFBQTtBQUFBLE1BRWQsY0FBYyx5QkFBeUIsT0FBTztBQUFBLE1BQzlDLFNBQVM7QUFBQSxRQUNSLFdBQVc7QUFBQSxRQUNYLE9BQU8sU0FBUyxnQkFBZ0IsZUFBZTtBQUFBLE1BQ2hEO0FBQUEsTUFDQSxNQUFNLENBQUM7QUFBQSxRQUNOLElBQUksTUFBTTtBQUFBLFFBQ1YsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxlQUFlLElBQUkseUJBQXlCLFVBQVUsR0FBRyw4QkFBOEIsVUFBVSxHQUFHLHFCQUFxQixPQUFPLENBQUM7QUFBQSxNQUN4SSxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBZSxJQUFJLFdBQTRDO0FBQzlELFVBQU0sbUJBQW1CLFVBQVUsSUFBSSxpQkFBaUI7QUFDeEQsMkJBQXVCLGtCQUFrQixjQUFjO0FBRXZELFVBQU0sZ0JBQWdCLFVBQVUsSUFBSSx1QkFBdUI7QUFDM0QsVUFBTSxlQUFlLFVBQVUsSUFBSSxhQUFhO0FBSWhELFFBQUksY0FBYyxVQUFVLE1BQU0sVUFBVSxHQUFHO0FBQzlDLFVBQUksYUFBYSxjQUFjLGdCQUFnQixHQUFHO0FBQ2pELHNCQUFjLGNBQWMsTUFBTSxNQUFNLFVBQVU7QUFDbEQ7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFVBQU0sZUFBZSx5QkFBdUQsNkJBQTZCLEVBQUU7QUFDM0csVUFBTSxrQkFBa0IsVUFBVSxJQUFJLGdCQUFnQjtBQUN0RCxVQUFNLGNBQWMsVUFBVSxJQUFJLFlBQVk7QUFFOUMsVUFBTSxnQkFBZ0IsZ0JBQWdCLGNBQWMsSUFBSTtBQUN4RCxVQUFNLE9BQU8sdUJBQXVCLGFBQWE7QUFDakQsVUFBTSxNQUFNLE1BQU0sT0FBTyxNQUFNLFlBQVksU0FBUztBQUNwRCxVQUFNLGFBQWEsZUFBZSxLQUFLLE1BQU0sYUFBYTtBQUMxRCxpQkFBYSxTQUFTLGdCQUFnQjtBQUFBLEVBQ3ZDO0FBQ0Q7QUFFQSxnQkFBZ0IsMkJBQTJCO0FBRTNDLE1BQU0sbUNBQW1DLFFBQVE7QUFBQSxFQUVoRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLHdCQUF3Qix3QkFBd0I7QUFBQSxNQUNqRSxJQUFJO0FBQUEsSUFDTCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBZSxNQUFxQjtBQUNuQyxVQUFNLGVBQWUseUJBQXVELDZCQUE2QixFQUFFO0FBQzNHLFVBQU0sYUFBYSxhQUFhO0FBQUEsRUFDakM7QUFDRDtBQUVBLGdCQUFnQiwwQkFBMEI7QUFFMUMsTUFBTSwrQkFBK0IsUUFBUTtBQUFBLEVBRTVDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsb0JBQW9CLG9CQUFvQjtBQUFBLE1BQ3pELElBQUk7QUFBQSxJQUNMLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFlLE1BQXFCO0FBQ25DLFVBQU0sZUFBZSx5QkFBdUQsNkJBQTZCLEVBQUU7QUFDM0csVUFBTSxhQUFhLGlCQUFpQjtBQUFBLEVBQ3JDO0FBQ0Q7QUFFQSxnQkFBZ0Isc0JBQXNCOyIsCiAgIm5hbWVzIjogW10KfQo=
