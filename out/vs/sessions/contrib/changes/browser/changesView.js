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
import "./media/changesView.css";
import * as dom from "../../../../base/browser/dom.js";
import { ActionViewItem, BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Schemas } from "../../../../base/common/network.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { ActionRunner, Separator, SubmenuAction, toAction } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { autorun, derived, derivedObservableWithCache, observableFromEvent, observableValue } from "../../../../base/common/observable.js";
import { CountBadge } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { ProgressBar } from "../../../../base/browser/ui/progressbar/progressbar.js";
import { basename, isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../nls.js";
import { MenuWorkbenchButtonBar, WorkbenchButtonBar } from "../../../../platform/actions/browser/buttonbar.js";
import { getActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { ActionWidgetDropdownActionViewItem } from "../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js";
import { MenuId, Action2, MenuItemAction, registerAction2, IMenuService } from "../../../../platform/actions/common/actions.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchCompressibleObjectTree } from "../../../../platform/list/browser/listService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { bindContextKey } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { defaultCountBadgeStyles, defaultProgressBarStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { fillEditorsDragData } from "../../../../workbench/browser/dnd.js";
import { ResourceLabels } from "../../../../workbench/browser/labels.js";
import { ViewPane, ViewAction } from "../../../../workbench/browser/parts/views/viewPane.js";
import { ViewPaneContainer } from "../../../../workbench/browser/parts/views/viewPaneContainer.js";
import { IViewDescriptorService } from "../../../../workbench/common/views.js";
import { CHAT_CATEGORY } from "../../../../workbench/contrib/chat/browser/actions/chatActions.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { createFileIconThemableTreeContainerScope } from "../../../../workbench/contrib/files/browser/views/explorerView.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../../workbench/services/editor/common/editorService.js";
import { IExtensionService } from "../../../../workbench/services/extensions/common/extensions.js";
import { IWorkbenchLayoutService } from "../../../../workbench/services/layout/browser/layoutService.js";
import { isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { getChangesEditorLabels } from "./changesEditorLabels.js";
import { ISessionChangesService } from "./sessionChangesService.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { CIStatusWidget } from "./checksWidget.js";
import { SessionFilesWidget } from "./sessionFilesWidget.js";
import { SessionFilesViewModel } from "./sessionFilesViewModel.js";
import { GITHUB_REMOTE_FILE_SCHEME, SessionChangesetOperationScope, SessionChangesetOperationStatus, SessionStatus } from "../../../services/sessions/common/session.js";
import { isAgentHostProviderId } from "../../../common/agentHostSessionsProvider.js";
import { Orientation } from "../../../../base/browser/ui/sash/sash.js";
import { LayoutPriority, Sizing, SplitView } from "../../../../base/browser/ui/splitview/splitview.js";
import { Color } from "../../../../base/common/color.js";
import { PANEL_SECTION_BORDER } from "../../../../workbench/common/theme.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../../workbench/common/editor.js";
import { logChangesViewFileSelect, logChangesViewVersionModeChange, logChangesViewViewModeChange } from "../../../common/sessionsTelemetry.js";
import { ChecksViewModel } from "./checksViewModel.js";
import { REVEAL_CI_CHECKS_COMMAND_ID } from "./checksActions.js";
import { AGENT_HOST_SKILL_BUTTON_UPDATE_PR_ID, isAgentHostSkillButtonId } from "../../providers/agentHost/browser/agentHostSkillButtons.js";
import { ActiveSessionContextKeys, CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID, ChangesContextKeys, ChangesViewMode, SESSIONS_CHANGES_OPEN_SINGLE_FILE_DIFF_SETTING } from "../common/changes.js";
import { buildTreeChildren, ChangesTreeRenderer, isChangesFileItem, toIChangesFileItem } from "./changesViewRenderer.js";
import { ResourceTree } from "../../../../base/common/resourceTree.js";
import { compareFileNames, comparePaths } from "../../../../base/common/comparers.js";
import { IViewsService } from "../../../../workbench/services/views/common/viewsService.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IChangesViewService } from "../common/changesViewService.js";
import { ChangesSummaryWidget } from "./changesSummaryWidget.js";
import { Menus } from "../../../browser/menus.js";
const $ = dom.$;
const RUN_SESSION_CODE_REVIEW_ACTION_ID = "sessions.codeReview.run";
const VERSIONS_PICKER_ACTION_ID = "chatEditing.versionsPicker";
const DIFF_STATS_ACTION_ID = "workbench.changesView.action.viewChanges";
const EMPTY_FILE_CHANGES_MIN_HEIGHT = 140;
const TREE_PANE_MIN_SIZE_MAX_ROWS = 13;
const TREE_PANE_LIST_BOTTOM_PADDING = 12;
let ChangesMenuWorkbenchButtonBarWidget = class extends Disposable {
  constructor(container, hasGitOperationInProgressObs, menuService, changesViewService, contextKeyService, contextMenuService, keybindingService, telemetryService, hoverService) {
    super();
    this._onDidChangeActions = this._register(new Emitter());
    this.onDidChangeActions = this._onDidChangeActions.event;
    const outgoingChangesObs = derivedObservableWithCache(this, (reader, lastValue) => {
      const activeSessionState = changesViewService.activeSessionStateObs.read(reader);
      const hasGitOperationInProgress = hasGitOperationInProgressObs.read(reader);
      if (hasGitOperationInProgress) {
        return lastValue;
      }
      return activeSessionState?.outgoingChanges;
    });
    const runningLabelObs = observableValue(this, void 0);
    this._register(autorun((reader) => {
      if (!hasGitOperationInProgressObs.read(reader)) {
        runningLabelObs.set(void 0, void 0);
      }
    }));
    this._register(autorun((reader) => {
      const hasGitOperationInProgress = hasGitOperationInProgressObs.read(reader);
      const sessionResource = changesViewService.activeSessionResourceObs.read(reader);
      const outgoingChanges = outgoingChangesObs.read(reader) ?? 0;
      const buttonBar = new MenuWorkbenchButtonBar(
        container,
        MenuId.AgentsChangesToolbar,
        {
          telemetrySource: "changesView",
          menuOptions: sessionResource ? { arg: sessionResource } : { shouldForwardArgs: true },
          buttonConfigProvider: (action) => this._getButtonConfiguration(action, outgoingChanges, hasGitOperationInProgress, runningLabelObs)
        },
        menuService,
        contextKeyService,
        contextMenuService,
        keybindingService,
        telemetryService,
        hoverService
      );
      reader.store.add(buttonBar.onWillRun((e) => runningLabelObs.set(e.action.label, void 0)));
      this._currentButtonBar = buttonBar;
      reader.store.add(buttonBar.onDidChange(() => this._onDidChangeActions.fire()));
      this._onDidChangeActions.fire();
      reader.store.add(buttonBar);
    }));
  }
  get hasActions() {
    return (this._currentButtonBar?.buttons.length ?? 0) > 0;
  }
  _getButtonConfiguration(action, outgoingChanges, hasGitOperationInProgress, runningLabelObs) {
    if (action.id === "github.copilot.sessions.commit" || action.id === "github.copilot.chat.createPullRequestCopilotCLIAgentSession.createPR") {
      if (!hasGitOperationInProgress) {
        return { showIcon: true, showLabel: true, isSecondary: false };
      }
      const customLabelObs = derived((reader) => {
        const running = runningLabelObs.read(reader);
        return `$(loading) ${running ?? action.label}`;
      });
      return { showIcon: false, showLabel: true, isSecondary: false, customLabelObs };
    }
    if (action.id === "github.copilot.sessions.sync" || action.id === "github.copilot.sessions.commitAndSync") {
      const labelWithCount = outgoingChanges > 0 ? `${action.label} ${outgoingChanges}\u2191` : `${action.label}`;
      if (!hasGitOperationInProgress) {
        return { showIcon: true, showLabel: true, isSecondary: false, customLabel: labelWithCount };
      }
      return { showIcon: false, showLabel: true, isSecondary: false, customLabel: `$(loading) ${labelWithCount}` };
    }
    if (action.id === "github.copilot.claude.sessions.sync" || action.id === AGENT_HOST_SKILL_BUTTON_UPDATE_PR_ID) {
      const customLabel = outgoingChanges > 0 ? `${action.label} ${outgoingChanges}\u2191` : action.label;
      return { customLabel, showIcon: true, showLabel: true, isSecondary: false };
    }
    if (action.id === RUN_SESSION_CODE_REVIEW_ACTION_ID || action.id === "chatEditing.viewAllSessionChanges" || action.id === "github.copilot.chat.openPullRequestCopilotCLIAgentSession.openPR") {
      return { showIcon: true, showLabel: false, isSecondary: true };
    }
    if (action.id === "agentFeedbackEditor.action.submitActiveSession") {
      return { showIcon: false, showLabel: true, isSecondary: false };
    }
    if (action.id === "github.copilot.chat.createPullRequestCopilotCLIAgentSession.createPR" || action.id === "github.copilot.chat.mergeCopilotCLIAgentSessionChanges.merge" || action.id === "github.copilot.chat.checkoutPullRequestReroute" || action.id === "pr.checkoutFromChat" || action.id === "github.copilot.sessions.initializeRepository" || action.id === "github.copilot.claude.sessions.initializeRepository" || action.id === "github.copilot.claude.sessions.commit" || action.id === "github.copilot.claude.sessions.commitAndSync" || action.id === "agentSession.restore" || action.id === "sessions.action.fixCIChecks" || isAgentHostSkillButtonId(action.id)) {
      return { showIcon: true, showLabel: true, isSecondary: false };
    }
    if (action instanceof MenuItemAction) {
      const icon = action.item.icon;
      if (icon) {
        return { showIcon: true, showLabel: false };
      }
    }
    return void 0;
  }
};
ChangesMenuWorkbenchButtonBarWidget = __decorateClass([
  __decorateParam(2, IMenuService),
  __decorateParam(3, IChangesViewService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IHoverService)
], ChangesMenuWorkbenchButtonBarWidget);
let ChangesWorkbenchButtonBarWidget = class extends Disposable {
  get hasActions() {
    return this._buttonBar.buttons.length > 0;
  }
  constructor(container, menuService, changesViewService, contextKeyService, instantiationService) {
    super();
    const menu = this._register(menuService.createMenu(MenuId.AgentsChangesToolbar, contextKeyService));
    const buttonBar = this._buttonBar = this._register(instantiationService.createInstance(
      WorkbenchButtonBar,
      container,
      {
        telemetrySource: "changesView",
        buttonConfigProvider: (_action, index) => {
          return { showIcon: true, showLabel: index === 0 };
        }
      }
    ));
    this.onDidChangeActions = Event.signal(buttonBar.onDidChange);
    const menuActionsObs = observableFromEvent(menu.onDidChange, () => {
      return getActionBarActions(menu.getActions({ shouldForwardArgs: true }));
    });
    const operationActionGroupsObs = derived((reader) => {
      const changeset = changesViewService.activeSessionChangesetObs.read(reader);
      if (!changeset) {
        return [];
      }
      const operations = changesViewService.activeSessionChangesetOperationsObs.read(reader);
      const changesetOperations = operations.filter((op) => op.scopes.includes(SessionChangesetOperationScope.Changeset));
      const toOperationAction = (op) => toAction({
        id: op.id,
        label: op.icon ? op.status === SessionChangesetOperationStatus.Running ? `$(loading) ${op.label}` : `$(${op.icon.id}) ${op.label}` : op.status === SessionChangesetOperationStatus.Running ? `$(loading) ${op.label}` : op.label,
        tooltip: op.description ?? op.label,
        enabled: op.status !== SessionChangesetOperationStatus.Disabled && op.status !== SessionChangesetOperationStatus.Running,
        run: () => changeset.invokeOperation(op.id)
      });
      const groups = /* @__PURE__ */ new Map();
      for (const op of changesetOperations) {
        if (op.status === SessionChangesetOperationStatus.Running) {
          continue;
        }
        const action = toOperationAction(op);
        const groupActions = groups.get(op.group);
        if (groupActions) {
          groupActions.push(action);
        } else {
          groups.set(op.group, [action]);
        }
      }
      const runningActions = changesetOperations.filter((op) => op.status === SessionChangesetOperationStatus.Running).map(toOperationAction);
      return [
        ...runningActions.length > 0 ? [runningActions] : [],
        ...groups.values()
      ];
    });
    this._register(autorun((reader) => {
      const isLoading = changesViewService.activeSessionLoadingObs.read(reader);
      if (isLoading) {
        return;
      }
      const operationActionGroups = operationActionGroupsObs.read(reader);
      const menuActions = menuActionsObs.read(reader);
      const primaryActions = [];
      const operationActions = operationActionGroups.flat();
      if (operationActions.length > 1) {
        const primaryAction = operationActions[0];
        const dropdownActions = [];
        for (const group of operationActionGroups) {
          if (dropdownActions.length > 0) {
            dropdownActions.push(new Separator());
          }
          dropdownActions.push(...group);
        }
        primaryActions.push(new SubmenuAction("changesView.operations.primary.dropdown", primaryAction.label, dropdownActions));
      } else {
        primaryActions.push(...operationActions);
      }
      primaryActions.push(...menuActions.primary);
      buttonBar.update(primaryActions, menuActions.secondary);
    }));
  }
};
ChangesWorkbenchButtonBarWidget = __decorateClass([
  __decorateParam(1, IMenuService),
  __decorateParam(2, IChangesViewService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IInstantiationService)
], ChangesWorkbenchButtonBarWidget);
let ChangesActionsBar = class extends Disposable {
  constructor(container, instantiationService, changesViewService, sessionsService, contextKeyService) {
    super();
    container.classList.add("changes-actions-bar");
    const hasGitOperationInProgressGlobalObs = observableFromEvent(contextKeyService.onDidChangeContext, () => contextKeyService.getContextKeyValue("sessions.hasGitOperationInProgress") === true);
    const hasGitOperationInProgressObs = derived((reader) => {
      if (hasGitOperationInProgressGlobalObs.read(reader)) {
        return true;
      }
      return changesViewService.activeSessionStateObs.read(reader)?.hasGitOperationInProgress === true;
    });
    const isAgentHostSessionObs = derived((reader) => {
      const activeSession = sessionsService.activeSession.read(reader);
      return activeSession ? isAgentHostProviderId(activeSession.providerId) : false;
    });
    let currentWidget;
    const updateVisibility = () => {
      const visible = currentWidget?.hasActions ?? false;
      dom.setVisibility(visible, container);
    };
    this._register(autorun((reader) => {
      dom.clearNode(container);
      const widget = isAgentHostSessionObs.read(reader) ? instantiationService.createInstance(ChangesWorkbenchButtonBarWidget, container) : instantiationService.createInstance(ChangesMenuWorkbenchButtonBarWidget, container, hasGitOperationInProgressObs);
      reader.store.add(widget);
      currentWidget = widget;
      reader.store.add(widget.onDidChangeActions(() => updateVisibility()));
      updateVisibility();
    }));
    this._register(autorun((reader) => {
      sessionsService.activeSession.read(reader)?.status.read(reader);
      updateVisibility();
    }));
  }
};
ChangesActionsBar = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IChangesViewService),
  __decorateParam(3, ISessionsService),
  __decorateParam(4, IContextKeyService)
], ChangesActionsBar);
const CHANGES_HEADER_ACTIONS_ID = "workbench.changesView.headerActions";
let ChangesActionsBarActionViewItem = class extends BaseActionViewItem {
  constructor(action, options, instantiationService) {
    super(void 0, action, options);
    this.instantiationService = instantiationService;
  }
  render(container) {
    super.render(container);
    this._register(this.instantiationService.createInstance(ChangesActionsBar, container));
  }
};
ChangesActionsBarActionViewItem = __decorateClass([
  __decorateParam(2, IInstantiationService)
], ChangesActionsBarActionViewItem);
let ChangesEditorHeaderContribution = class extends Disposable {
  constructor(actionViewItemService) {
    super();
    const onDidRegister = this._register(new Emitter());
    this._register(actionViewItemService.register(Menus.SessionsEditorHeaderPrimary, VERSIONS_PICKER_ACTION_ID, (action, _options, instantiationService) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(ChangesPickerActionItem, action);
    }, onDidRegister.event));
    this._register(actionViewItemService.register(Menus.SessionsEditorHeaderPrimary, DIFF_STATS_ACTION_ID, (action, options, instantiationService) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(SinglePaneChangesDiffStatsActionItem, action, options);
    }, onDidRegister.event));
    onDidRegister.fire();
  }
};
ChangesEditorHeaderContribution.ID = "workbench.contrib.changesEditorHeader";
ChangesEditorHeaderContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService)
], ChangesEditorHeaderContribution);
registerWorkbenchContribution2(ChangesEditorHeaderContribution.ID, ChangesEditorHeaderContribution, WorkbenchPhase.BlockRestore);
let ChangesViewPane = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, changesViewService, editorService, sessionsService, labelService, logService, telemetryService, sessionChangesService, workbenchLayoutService) {
    super({ ...options, titleMenuId: MenuId.ChatEditingSessionTitleToolbar }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.changesViewService = changesViewService;
    this.editorService = editorService;
    this.sessionsService = sessionsService;
    this.labelService = labelService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this.sessionChangesService = sessionChangesService;
    this.workbenchLayoutService = workbenchLayoutService;
    this.treePaneSizeChange = this._register(new Emitter());
    /** Once the user drags a sash we stop imposing the CI pane's default height. */
    this.ciPaneUserResized = false;
    this.renderDisposables = this._register(new DisposableStore());
    // Track current body dimensions for list layout
    this.currentBodyHeight = 0;
    this.currentBodyWidth = 0;
    this.isMergeBaseBranchProtectedContextKey = ActiveSessionContextKeys.IsMergeBaseBranchProtected.bindTo(this.scopedContextKeyService);
    this.isolationModeContextKey = ActiveSessionContextKeys.IsolationMode.bindTo(this.scopedContextKeyService);
    this.hasGitRepositoryContextKey = ActiveSessionContextKeys.HasGitRepository.bindTo(this.scopedContextKeyService);
    this.hasUpstreamContextKey = ActiveSessionContextKeys.HasUpstream.bindTo(this.scopedContextKeyService);
    this.hasIncomingChangesContextKey = ActiveSessionContextKeys.HasIncomingChanges.bindTo(this.scopedContextKeyService);
    this.hasOutgoingChangesContextKey = ActiveSessionContextKeys.HasOutgoingChanges.bindTo(this.scopedContextKeyService);
    this.hasUncommittedChangesContextKey = ActiveSessionContextKeys.HasUncommittedChanges.bindTo(this.scopedContextKeyService);
    this.hasBranchChangesContextKey = ActiveSessionContextKeys.HasBranchChanges.bindTo(this.scopedContextKeyService);
    this.hasGitHubRemoteContextKey = ActiveSessionContextKeys.HasGitHubRemote.bindTo(this.scopedContextKeyService);
    this.hasPullRequestContextKey = ActiveSessionContextKeys.HasPullRequest.bindTo(this.scopedContextKeyService);
    this.hasOpenPullRequestContextKey = ActiveSessionContextKeys.HasOpenPullRequest.bindTo(this.scopedContextKeyService);
    this.hasGitOperationInProgressContextKey = ActiveSessionContextKeys.HasGitOperationInProgress.bindTo(this.scopedContextKeyService);
    this._register(bindContextKey(ChangesContextKeys.VersionMode, this.scopedContextKeyService, (reader) => {
      return this.changesViewService.activeSessionChangesetObs.read(reader)?.id ?? "";
    }));
    this._register(bindContextKey(ChangesContextKeys.ViewMode, this.scopedContextKeyService, (reader) => {
      return this.changesViewService.viewModeObs.read(reader);
    }));
    this._register(bindContextKey(ChatContextKeys.agentSessionType, this.scopedContextKeyService, (reader) => {
      return this.changesViewService.activeSessionTypeObs.read(reader) ?? "";
    }));
    const hasGitOperationInProgressGlobalContextObs = observableFromEvent(this.contextKeyService.onDidChangeContext, () => {
      return this.contextKeyService.getContextKeyValue("sessions.hasGitOperationInProgress") === true;
    });
    const hasGitOperationInProgressStateObs = derived((reader) => {
      const activeSessionState = this.changesViewService.activeSessionStateObs.read(reader);
      return activeSessionState?.hasGitOperationInProgress === true;
    });
    this.hasGitOperationInProgressObs = derived((reader) => {
      const hasGitOperationInProgressGlobalContext = hasGitOperationInProgressGlobalContextObs.read(reader);
      const hasGitOperationInProgressState = hasGitOperationInProgressStateObs.read(reader);
      const contextKeyValue = hasGitOperationInProgressGlobalContext === true ? hasGitOperationInProgressGlobalContext : hasGitOperationInProgressState;
      this.hasGitOperationInProgressContextKey.set(contextKeyValue);
      return contextKeyValue;
    });
    const scopedServiceCollection = new ServiceCollection([IContextKeyService, this.scopedContextKeyService]);
    this.scopedInstantiationService = this.instantiationService.createChild(scopedServiceCollection);
    this._register(this.scopedInstantiationService);
  }
  renderBody(container) {
    super.renderBody(container);
    this.bodyContainer = dom.append(container, $(".changes-view-body"));
    this.actionsContainer = dom.append(this.bodyContainer, $(".chat-editing-session-actions.outside-card"));
    this.splitViewContainer = dom.append(this.bodyContainer, $(".changes-splitview-container"));
    this.contentContainer = dom.append(this.splitViewContainer, $(".chat-editing-session-container.show-file-icons"));
    this._register(createFileIconThemableTreeContainerScope(this.contentContainer, this.themeService));
    const updateHasFileIcons = () => {
      this.contentContainer.classList.toggle("has-file-icons", this.themeService.getFileIconTheme().hasFileIcons);
    };
    updateHasFileIcons();
    this._register(this.themeService.onDidFileIconThemeChange(updateHasFileIcons));
    this.createFilesHeader(this.contentContainer);
    const progressContainer = dom.append(this.contentContainer, $(".changes-progress"));
    this.changesProgressBar = this._register(new ProgressBar(progressContainer, defaultProgressBarStyles));
    this.changesProgressBar.stop().hide();
    this.listContainer = dom.append(this.contentContainer, $(".changes-file-list"));
    this.welcomeContainer = dom.append(this.contentContainer, $(".changes-welcome"));
    this.welcomeContainer.style.display = "none";
    const welcomeMessage = dom.append(this.welcomeContainer, $(".changes-welcome-message"));
    welcomeMessage.textContent = localize("changesView.noChanges", "Changed files and other session artifacts will appear here.");
    this.sessionFilesWidget = this._register(this.scopedInstantiationService.createInstance(SessionFilesWidget, this.splitViewContainer));
    this.ciStatusWidget = this._register(this.scopedInstantiationService.createInstance(CIStatusWidget, this.splitViewContainer));
    this.splitView = this._register(new SplitView(this.splitViewContainer, {
      orientation: Orientation.VERTICAL,
      proportionalLayout: false
    }));
    const ciMinHeight = CIStatusWidget.HEADER_HEIGHT + CIStatusWidget.MIN_BODY_HEIGHT;
    const sessionFilesMinHeight = SessionFilesWidget.HEADER_HEIGHT + SessionFilesWidget.MIN_BODY_HEIGHT;
    const getSessionFilesContentHeight = () => Math.max(SessionFilesWidget.HEADER_HEIGHT, this.sessionFilesWidget?.desiredHeight ?? 0);
    const getSessionFilesMinimumHeight = () => this.sessionFilesWidget?.collapsed ? SessionFilesWidget.HEADER_HEIGHT : Math.min(sessionFilesMinHeight, getSessionFilesContentHeight());
    const getSessionFilesPreferredHeight = () => Math.max(getSessionFilesMinimumHeight(), SessionFilesWidget.HEADER_HEIGHT + SessionFilesWidget.PREFERRED_BODY_HEIGHT);
    const getCIContentHeight = () => Math.max(CIStatusWidget.HEADER_HEIGHT, this.ciStatusWidget?.desiredHeight ?? 0);
    const getCIMinimumHeight = () => this.ciStatusWidget?.collapsed ? CIStatusWidget.HEADER_HEIGHT : Math.min(ciMinHeight, getCIContentHeight());
    const getCIPreferredHeight = () => {
      const contentHeight = getCIContentHeight();
      if (this.ciStatusWidget?.collapsed) {
        return CIStatusWidget.HEADER_HEIGHT;
      }
      const availableHeight = this.getSplitViewAvailableHeight();
      if (availableHeight > 0) {
        return Math.max(getCIMinimumHeight(), Math.min(contentHeight, Math.round(availableHeight / 3)));
      }
      return contentHeight;
    };
    this.computeCIPreferredHeight = getCIPreferredHeight;
    const thisView = this;
    const treePane = {
      element: this.contentContainer,
      get minimumSize() {
        return thisView.getTreePaneMinimumSize();
      },
      get maximumSize() {
        return thisView.getTreePaneMaximumSize();
      },
      onDidChange: this.treePaneSizeChange.event,
      layout: (height) => {
        this.contentContainer.style.height = `${height}px`;
        this._layoutTreeInPane(height);
      }
    };
    const sessionFilesElement = this.sessionFilesWidget.element;
    const sessionFilesWidget = this.sessionFilesWidget;
    const sessionFilesPane = {
      element: sessionFilesElement,
      get minimumSize() {
        return getSessionFilesMinimumHeight();
      },
      get maximumSize() {
        return sessionFilesWidget.collapsed ? SessionFilesWidget.HEADER_HEIGHT : Number.POSITIVE_INFINITY;
      },
      priority: LayoutPriority.High,
      onDidChange: Event.map(this.sessionFilesWidget.onDidChangeHeight, () => void 0),
      layout: (height) => {
        sessionFilesElement.style.height = `${height}px`;
        const bodyHeight = Math.max(0, height - SessionFilesWidget.HEADER_HEIGHT);
        sessionFilesWidget.layout(bodyHeight);
      }
    };
    const ciElement = this.ciStatusWidget.element;
    const ciWidget = this.ciStatusWidget;
    const ciPane = {
      element: ciElement,
      get minimumSize() {
        return getCIMinimumHeight();
      },
      get maximumSize() {
        return ciWidget.collapsed ? CIStatusWidget.HEADER_HEIGHT : getCIContentHeight();
      },
      priority: LayoutPriority.Low,
      onDidChange: Event.map(this.ciStatusWidget.onDidChangeHeight, () => getCIContentHeight()),
      layout: (height) => {
        ciElement.style.height = `${height}px`;
        const bodyHeight = Math.max(0, height - CIStatusWidget.HEADER_HEIGHT);
        ciWidget.layout(bodyHeight);
      }
    };
    this.splitView.addView(treePane, Sizing.Distribute, 0, true);
    this.splitView.addView(sessionFilesPane, SessionFilesWidget.HEADER_HEIGHT + SessionFilesWidget.PREFERRED_BODY_HEIGHT, 1, true);
    this.splitView.addView(ciPane, CIStatusWidget.HEADER_HEIGHT + CIStatusWidget.PREFERRED_BODY_HEIGHT, 2, true);
    const updateSplitViewStyles = () => {
      const borderColor = this.themeService.getColorTheme().getColor(PANEL_SECTION_BORDER);
      this.splitView.style({ separatorBorder: borderColor ?? Color.transparent });
    };
    updateSplitViewStyles();
    this._register(this.themeService.onDidColorThemeChange(updateSplitViewStyles));
    this._register(this.splitView.onDidSashChange(() => {
      this.ciPaneUserResized = true;
    }));
    this.splitView.setViewVisible(1, false);
    this.splitView.setViewVisible(2, false);
    this._wireSectionPane(this.sessionFilesWidget, 1, SessionFilesWidget.HEADER_HEIGHT, getSessionFilesPreferredHeight);
    this._register(this.sessionFilesWidget.onDidChangeHeight(() => this.fireTreePaneSizeChange()));
    this._wireSectionPane(this.ciStatusWidget, 2, CIStatusWidget.HEADER_HEIGHT, getCIPreferredHeight, () => {
      this.ciPaneUserResized = false;
    });
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (visible) {
        this.onVisible();
      } else {
        this.renderDisposables.clear();
      }
    }));
    if (this.isBodyVisible()) {
      this.onVisible();
    }
  }
  getActionsContext() {
    return this.changesViewService.activeSessionResourceObs.get();
  }
  onVisible() {
    this.renderDisposables.clear();
    this.renderDisposables.add(autorun((reader) => {
      this.changesViewService.activeSessionResourceObs.read(reader);
      this.updateActions();
    }));
    this.renderDisposables.add(autorun((reader) => {
      const isLoading = this.changesViewService.activeSessionChangesetLoadingObs.read(reader);
      if (isLoading) {
        this.changesProgressBar.infinite().show(200);
      } else {
        this.changesProgressBar.stop().hide();
      }
    }));
    const changesObs = derived((reader) => {
      const changes = this.changesViewService.activeSessionChangesObs.read(reader);
      return toIChangesFileItem(changes);
    });
    const topLevelStats = derivedObservableWithCache(this, (reader, lastValue) => {
      const isLoading = this.changesViewService.activeSessionChangesetLoadingObs.read(reader);
      if (isLoading) {
        return lastValue;
      }
      const entries = changesObs.read(reader);
      let added = 0, removed = 0;
      for (const entry of entries) {
        added += entry.linesAdded;
        removed += entry.linesRemoved;
      }
      return { files: entries.length, added, removed };
    });
    if (this.actionsContainer) {
      this._bindContextKeys(topLevelStats);
      this.createActionsButtonBar();
    }
    const activeSessionStatusObs = derived((reader) => {
      const activeSession = this.sessionsService.activeSession.read(reader);
      return activeSession?.status.read(reader);
    });
    this.renderDisposables.add(autorun((reader) => {
      if (this.changesViewService.activeSessionLoadingObs.read(reader)) {
        return;
      }
      const activeSessionStatus = activeSessionStatusObs.read(reader);
      const isUntitled = activeSessionStatus === SessionStatus.Untitled;
      if (this.actionsContainer) {
        dom.setVisibility(this.isActionsContainerVisible(isUntitled), this.actionsContainer);
      }
      const stats = topLevelStats.read(reader);
      const hasEntries = stats !== void 0 && stats.files > 0;
      if (this.filesHeaderNode) {
        const hasGitRepository = this.changesViewService.activeSessionHasGitRepositoryObs.read(reader);
        dom.setVisibility(!isUntitled && (hasGitRepository || hasEntries), this.filesHeaderNode);
      }
      if (this.fileHeaderToolbarContainer) {
        dom.setVisibility(hasEntries, this.fileHeaderToolbarContainer);
      }
      dom.setVisibility(hasEntries, this.listContainer);
      dom.setVisibility(!hasEntries, this.welcomeContainer);
      this.fireTreePaneSizeChange();
      this.layoutSplitView();
    }));
    if (!this.tree && this.listContainer) {
      this.tree = this.createChangesTree(this.listContainer, this.onDidChangeBodyVisibility, this._store);
    }
    if (this.tree) {
      const tree = this.tree;
      this.renderDisposables.add(tree.onDidChangeContentHeight(() => {
        this.fireTreePaneSizeChange();
        this.layoutSplitView();
      }));
      this.renderDisposables.add(tree.onDidOpen((e) => {
        if (!e.element || !isChangesFileItem(e.element)) {
          return;
        }
        logChangesViewFileSelect(this.telemetryService, e.element.changeType);
        if (this.shouldOpenModalDiff()) {
          const items = changesObs.get();
          this._openFileItem(e.element, items, e.sideBySide, !!e.editorOptions?.preserveFocus, !!e.editorOptions?.pinned, items.length > 1);
          return;
        }
        const altKey = !!e.browserEvent?.altKey;
        const openSingleFileDiff = this.shouldOpenSingleFileDiffByDefault() !== altKey;
        if (openSingleFileDiff) {
          const sideBySide = e.sideBySide && !altKey;
          void this._openSingleFileDiffEditor(e.element, sideBySide, !!e.editorOptions?.preserveFocus, !!e.editorOptions?.pinned);
          return;
        }
        void this._openMultiFileDiffEditor(e.element.uri);
      }));
    }
    if (this.ciStatusWidget) {
      const checksViewModel = this.scopedInstantiationService.createInstance(ChecksViewModel);
      this.renderDisposables.add(checksViewModel);
      this.renderDisposables.add(this.ciStatusWidget.setInput(checksViewModel));
    }
    if (this.sessionFilesWidget) {
      const sessionFilesViewModel = this.scopedInstantiationService.createInstance(SessionFilesViewModel);
      this.renderDisposables.add(sessionFilesViewModel);
      this.renderDisposables.add(this.sessionFilesWidget.setInput(sessionFilesViewModel));
    }
    this.renderDisposables.add(autorun((reader) => {
      const changes = changesObs.read(reader);
      const viewMode = this.changesViewService.viewModeObs.read(reader);
      const changesetLoading = this.changesViewService.activeSessionChangesetLoadingObs.read(reader);
      this.changesViewService.activeSessionStateObs.read(reader);
      if (!this.tree || changesetLoading) {
        return;
      }
      this.listContainer?.classList.toggle("list-mode", viewMode === ChangesViewMode.List);
      if (viewMode === ChangesViewMode.Tree) {
        const treeRootInfo = this.getTreeRootInfo(changes);
        const treeChildren = buildTreeChildren(changes, treeRootInfo);
        this.tree.setChildren(null, treeChildren);
      } else {
        const listChildren = changes.map((item) => ({
          element: item,
          collapsible: false
        }));
        this.tree.setChildren(null, listChildren);
      }
      this.fireTreePaneSizeChange();
      this.layoutSplitView();
    }));
  }
  _bindContextKeys(topLevelStats) {
    this.renderDisposables.add(bindContextKey(ChatContextKeys.requestInProgress, this.scopedContextKeyService, (reader) => {
      const activeSessionStatus = this.sessionsService.activeSession.read(reader)?.status.read(reader);
      return activeSessionStatus !== SessionStatus.Completed && activeSessionStatus !== SessionStatus.Error;
    }));
    this.renderDisposables.add(bindContextKey(ChatContextKeys.hasAgentSessionChanges, this.scopedContextKeyService, (reader) => {
      const stats = topLevelStats.read(reader);
      return stats !== void 0 && stats.files > 0;
    }));
    this.renderDisposables.add(autorun((reader) => {
      const state = this.changesViewService.activeSessionStateObs.read(reader);
      if (!state || state.hasGitOperationInProgress) {
        return;
      }
      this.logService.info(`[ChangesViewPane][_bindContextKeys] Context keys: ${JSON.stringify(state)}`);
      this.scopedContextKeyService.bufferChangeEvents(() => {
        this.isolationModeContextKey.set(state.isolationMode);
        this.hasGitRepositoryContextKey.set(state.hasGitRepository);
        this.isMergeBaseBranchProtectedContextKey.set(state.isMergeBaseBranchProtected === true);
        this.hasGitHubRemoteContextKey.set(state.hasGitHubRemote === true);
        this.hasPullRequestContextKey.set(state.hasPullRequest === true);
        this.hasOpenPullRequestContextKey.set(state.hasOpenPullRequest === true);
        this.hasUpstreamContextKey.set(state.upstreamBranchName !== void 0);
        this.hasIncomingChangesContextKey.set(state.incomingChanges !== void 0 && state.incomingChanges > 0);
        this.hasOutgoingChangesContextKey.set(state.outgoingChanges !== void 0 && state.outgoingChanges > 0);
        this.hasUncommittedChangesContextKey.set(state.uncommittedChanges !== void 0 && state.uncommittedChanges > 0);
        this.hasBranchChangesContextKey.set(state.hasBranchChanges === true);
        this.hasGitOperationInProgressContextKey.set(state.hasGitOperationInProgress === true);
      });
    }));
  }
  /** Layout the tree within its SplitView pane. */
  _layoutTreeInPane(paneHeight) {
    if (!this.tree) {
      return;
    }
    const filesHeaderHeight = this.filesHeaderNode?.offsetHeight ?? 0;
    const treeHeight = Math.max(0, paneHeight - filesHeaderHeight);
    this.tree.layout(treeHeight, this.currentBodyWidth);
    this.tree.getHTMLElement().style.height = `${treeHeight}px`;
  }
  getTreePaneMinimumSize() {
    if (this.listContainer?.style.display === "none") {
      return EMPTY_FILE_CHANGES_MIN_HEIGHT;
    }
    const filesHeaderHeight = this.filesHeaderNode?.offsetHeight ?? 0;
    const treeContentHeight = this.tree?.contentHeight ?? 0;
    const maxRowsHeight = TREE_PANE_MIN_SIZE_MAX_ROWS * ChangesTreeDelegate.ROW_HEIGHT;
    const cappedContentHeight = Math.min(treeContentHeight, maxRowsHeight);
    const bottomPadding = treeContentHeight <= maxRowsHeight ? TREE_PANE_LIST_BOTTOM_PADDING : 0;
    return Math.max(EMPTY_FILE_CHANGES_MIN_HEIGHT, filesHeaderHeight + cappedContentHeight + bottomPadding);
  }
  getTreePaneMaximumSize() {
    if (!this.sessionFilesWidget?.visible || this.sessionFilesWidget.collapsed) {
      return Number.POSITIVE_INFINITY;
    }
    const filesHeaderHeight = this.filesHeaderNode?.offsetHeight ?? 0;
    const treeContentHeight = this.listContainer?.style.display === "none" ? 0 : this.tree?.contentHeight ?? 0;
    const bottomPadding = treeContentHeight > 0 ? TREE_PANE_LIST_BOTTOM_PADDING : 0;
    return Math.max(this.getTreePaneMinimumSize(), filesHeaderHeight + treeContentHeight + bottomPadding);
  }
  fireTreePaneSizeChange() {
    this.treePaneSizeChange.fire(void 0);
  }
  /** Compute the height available to the SplitView within the body. */
  getSplitViewAvailableHeight() {
    const bodyHeight = this.currentBodyHeight;
    if (bodyHeight <= 0) {
      return 0;
    }
    const bodyPadding = 16;
    const actionsHeight = this.actionsContainer?.offsetHeight ?? 0;
    const actionsMargin = actionsHeight > 0 ? 8 : 0;
    return Math.max(0, bodyHeight - bodyPadding - actionsHeight - actionsMargin);
  }
  /** Layout the SplitView to fill available body space. */
  layoutSplitView() {
    if (!this.splitView || !this.splitViewContainer) {
      return;
    }
    const availableHeight = this.getSplitViewAvailableHeight();
    if (availableHeight <= 0) {
      return;
    }
    this.splitViewContainer.style.height = `${availableHeight}px`;
    this.splitView.layout(availableHeight);
    this.applyCIDefaultSize();
  }
  /**
   * Re-assert the CI pane's default height (capped to a third of the split) after layout.
   * This is where the split height is reliably known — the preferred height can otherwise be
   * evaluated during wiring when the body height is still 0, yielding an uncapped fallback.
   * Once the user drags a sash we back off and preserve their chosen size.
   */
  applyCIDefaultSize() {
    if (!this.splitView || this.ciPaneUserResized || !this.computeCIPreferredHeight) {
      return;
    }
    if (!this.ciStatusWidget?.visible || this.ciStatusWidget.collapsed) {
      return;
    }
    const preferred = this.computeCIPreferredHeight();
    if (this.splitView.getViewSize(2) !== preferred) {
      this.splitView.resizeView(2, preferred);
    }
  }
  /**
   * Wires a collapsible section widget (CI checks / other files) to its
   * SplitView pane: toggling its header collapses/restores the pane, and
   * changes to its content show/hide the pane and re-layout. Both section
   * widgets share the same structural contract so this logic is reused.
   */
  _wireSectionPane(widget, paneIndex, headerHeight, getPreferredHeight, onDidBecomeVisible) {
    let savedPaneHeight = getPreferredHeight();
    this._register(widget.onDidToggleCollapsed((collapsed) => {
      if (!this.splitView) {
        return;
      }
      if (collapsed) {
        const currentSize = this.splitView.getViewSize(paneIndex);
        if (currentSize > headerHeight) {
          savedPaneHeight = currentSize;
        }
        this.splitView.resizeView(paneIndex, headerHeight);
      } else {
        this.splitView.resizeView(paneIndex, savedPaneHeight);
      }
      this.layoutSplitView();
    }));
    this._register(widget.onDidChangeHeight(() => {
      if (!this.splitView) {
        return;
      }
      const visible = widget.visible;
      const isCurrentlyVisible = this.splitView.isViewVisible(paneIndex);
      if (visible !== isCurrentlyVisible) {
        this.splitView.setViewVisible(paneIndex, visible);
        if (visible && !widget.collapsed) {
          onDidBecomeVisible?.();
          savedPaneHeight = getPreferredHeight();
          this.splitView.resizeView(paneIndex, savedPaneHeight);
        }
      }
      this.layoutSplitView();
    }));
  }
  getTreeSelection() {
    const selection = this.tree?.getSelection() ?? [];
    return selection.filter((item) => !!item && isChangesFileItem(item));
  }
  getTreeRootInfo(items) {
    if (items.length === 0) {
      return void 0;
    }
    const activeSession = this.sessionsService.activeSession.get();
    const folder = activeSession?.workspace.get()?.folders[0];
    const workspaceFolderUri = folder?.workingDirectory;
    if (!folder?.root || !workspaceFolderUri) {
      return void 0;
    }
    let name = "";
    let resourceTreeRootUri = workspaceFolderUri;
    if (workspaceFolderUri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
      resourceTreeRootUri = URI.from({ scheme: Schemas.copilotPr, path: "/" });
      const segments = workspaceFolderUri.path.split("/").filter(Boolean);
      name = `${segments.slice(0, 2).join("/")} (${decodeURIComponent(segments[2])})`;
    } else {
      const branchName = this.changesViewService.activeSessionStateObs.get()?.branchName;
      name = branchName ? `${basename(folder.workingDirectory)} (${branchName})` : basename(folder.workingDirectory);
    }
    return {
      root: {
        type: "root",
        uri: workspaceFolderUri,
        name
      },
      resourceTreeRootUri
    };
  }
  getSessionDiscardRef() {
    const changeset = this.changesViewService.activeSessionChangesetObs.get();
    return changeset?.originalCheckpointRef.get() ?? "";
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.currentBodyHeight = height;
    this.currentBodyWidth = width;
    this.layoutSplitView();
  }
  focus() {
    super.focus();
    if (this.tree && this.tree.getNode(null).visibleChildrenCount > 0) {
      this.tree.domFocus();
    }
  }
  renderSidebarList(container, onDidLayout, contextKeyService, items, openFileItem) {
    const disposables = new DisposableStore();
    container.classList.add("changes-file-list");
    const viewMode = this.changesViewService.viewModeObs.get();
    container.classList.toggle("list-mode", viewMode === ChangesViewMode.List);
    const headerNode = dom.append(container, $(".changes-sidebar-header"));
    const headerLabel = dom.append(headerNode, $("span"));
    headerLabel.textContent = localize("changes", "Changes");
    const countBadge = disposables.add(new CountBadge(headerNode, { count: items.length }, defaultCountBadgeStyles));
    countBadge.setCount(items.length);
    const tree = this.createChangesTree(container, Event.None, disposables, () => tree.getSelection().filter((item) => !!item && isChangesFileItem(item)), contextKeyService);
    if (viewMode === ChangesViewMode.Tree) {
      tree.setChildren(null, buildTreeChildren(items, this.getTreeRootInfo(items)));
    } else {
      tree.setChildren(null, items.map((item) => ({ element: item, collapsible: false })));
    }
    let updatingSelection = false;
    disposables.add(tree.onDidOpen((e) => {
      if (e.element && isChangesFileItem(e.element) && !updatingSelection) {
        openFileItem(
          e.element,
          items,
          e.sideBySide,
          !!e.editorOptions.preserveFocus,
          !!e.editorOptions.pinned,
          false
          /* preserve existing sidebar */
        );
      }
    }));
    disposables.add(Event.runAndSubscribe(this.editorService.onDidActiveEditorChange, () => {
      const activeEditor = this.editorService.activeEditor;
      if (!activeEditor) {
        return;
      }
      const primaryResource = EditorResourceAccessor.getCanonicalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
      const secondaryResource = EditorResourceAccessor.getCanonicalUri(activeEditor, { supportSideBySide: SideBySideEditor.SECONDARY });
      const index = items.findIndex(
        (i) => primaryResource !== void 0 && isEqual(i.uri, primaryResource) || secondaryResource !== void 0 && i.originalUri !== void 0 && isEqual(i.originalUri, secondaryResource)
      );
      if (index >= 0) {
        updatingSelection = true;
        try {
          tree.setFocus([items[index]]);
          tree.setSelection([items[index]]);
          tree.reveal(items[index]);
        } finally {
          updatingSelection = false;
        }
      }
    }));
    disposables.add(onDidLayout((e) => {
      const headerHeight = headerNode.offsetHeight;
      tree.layout(Math.max(0, e.height - headerHeight), e.width);
    }));
    return disposables;
  }
  createChangesTree(container, onDidChangeVisibility, disposables, getSelection, contextKeyService) {
    const treeInstantiationService = contextKeyService ? disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService]))) : this.instantiationService;
    const resourceLabels = disposables.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility }));
    const actionRunner = disposables.add(new ChangesViewActionRunner(
      () => this.changesViewService.activeSessionResourceObs.get(),
      () => this.getSessionDiscardRef(),
      getSelection ?? (() => this.getTreeSelection())
    ));
    return disposables.add(treeInstantiationService.createInstance(
      WorkbenchCompressibleObjectTree,
      "ChangesViewTree",
      container,
      new ChangesTreeDelegate(),
      [this.instantiationService.createInstance(
        ChangesTreeRenderer,
        resourceLabels,
        actionRunner,
        () => {
          const activeSession = this.sessionsService.activeSession.get();
          const folder = activeSession?.workspace.get()?.folders[0];
          return folder?.root.scheme === GITHUB_REMOTE_FILE_SCHEME ? URI.from({ scheme: Schemas.copilotPr, path: "/" }) : folder?.workingDirectory;
        }
      )],
      {
        alwaysConsumeMouseWheel: false,
        accessibilityProvider: {
          getAriaLabel: (element) => isChangesFileItem(element) ? basename(element.uri) : element.name,
          getWidgetAriaLabel: () => localize("changesViewTree", "Changes Tree")
        },
        dnd: {
          getDragURI: (element) => element.uri.toString(),
          getDragLabel: (elements) => {
            const uris = elements.map((e) => e.uri);
            if (uris.length === 1) {
              return this.labelService.getUriLabel(uris[0], { relative: true });
            }
            return `${uris.length}`;
          },
          dispose: () => {
          },
          onDragOver: () => false,
          drop: () => {
          },
          onDragStart: (data, originalEvent) => {
            try {
              const elements = data.getData();
              const uris = elements.filter(isChangesFileItem).map((e) => e.uri);
              this.instantiationService.invokeFunction((accessor) => fillEditorsDragData(accessor, uris, originalEvent));
            } catch {
            }
          }
        },
        identityProvider: {
          getId: (element) => element.uri.toString()
        },
        indent: this.changesViewService.viewModeObs.get() === ChangesViewMode.List ? 0 : 8,
        compressionEnabled: true,
        sorter: new ChangesTreeSorter(() => this.changesViewService.viewModeObs.get()),
        twistieAdditionalCssClass: (e) => {
          return this.changesViewService.viewModeObs.get() === ChangesViewMode.List ? "force-no-twistie" : void 0;
        }
      }
    ));
  }
  async openChanges(resource) {
    const items = this.changesViewService.activeSessionChangesObs.get();
    if (items.length === 0) {
      return;
    }
    if (this.shouldOpenModalDiff()) {
      const changes = toIChangesFileItem(items);
      const changeToOpen = resource ? changes.find((c) => isEqual(c.uri, resource)) : void 0;
      await this._openFileItem(changeToOpen ?? changes[0], changes, false, false, false, changes.length > 1);
      return;
    }
    await this._openMultiFileDiffEditor(resource);
  }
  /**
   * Renders the files header (Branch Changes dropdown + diff stats) into the panel.
   * Standard layout only; {@link SinglePaneChangesViewPane} overrides this to a no-op
   * because the header lives in the custom Changes editor instead.
   */
  createFilesHeader(contentContainer) {
    this.filesHeaderNode = dom.append(contentContainer, $(".changes-files-header"));
    const filesHeaderToolbarContainer = dom.append(this.filesHeaderNode, $(".changes-files-header-toolbar"));
    this._register(this.scopedInstantiationService.createInstance(MenuWorkbenchToolBar, filesHeaderToolbarContainer, MenuId.ChatEditingSessionChangesFileHeaderToolbar, {
      menuOptions: { shouldForwardArgs: true },
      actionViewItemProvider: (action) => {
        if (action.id === "chatEditing.versionsPicker" && action instanceof MenuItemAction) {
          return this.scopedInstantiationService.createInstance(ChangesPickerActionItem, action);
        }
        return void 0;
      }
    }));
    this.fileHeaderToolbarContainer = dom.append(this.filesHeaderNode, $(".changes-files-header-right-toolbar"));
    this._register(this.scopedInstantiationService.createInstance(MenuWorkbenchToolBar, this.fileHeaderToolbarContainer, MenuId.ChatEditingSessionChangesFileHeaderRightToolbar, {
      menuOptions: { shouldForwardArgs: true },
      actionViewItemProvider: (action, options) => {
        if (action.id === ChangesDiffStatsAction.ID && action instanceof MenuItemAction) {
          return this.scopedInstantiationService.createInstance(ChangesDiffStatsActionItem, action, options);
        }
        return void 0;
      }
    }));
  }
  /**
   * Renders the Create-PR actions button bar into the actions container. Standard
   * layout only; {@link SinglePaneChangesViewPane} overrides this to a no-op because
   * the actions render in the Changes editor header instead.
   */
  createActionsButtonBar() {
    if (!this.actionsContainer) {
      return;
    }
    const isAgentHostSessionObs = derived((reader) => {
      const activeSession = this.sessionsService.activeSession.read(reader);
      return activeSession ? isAgentHostProviderId(activeSession.providerId) : false;
    });
    this.renderDisposables.add(autorun((reader) => {
      dom.clearNode(this.actionsContainer);
      const isAgentHostSession = isAgentHostSessionObs.read(reader);
      const widget = isAgentHostSession ? this.scopedInstantiationService.createInstance(ChangesWorkbenchButtonBarWidget, this.actionsContainer) : this.scopedInstantiationService.createInstance(ChangesMenuWorkbenchButtonBarWidget, this.actionsContainer, this.hasGitOperationInProgressObs);
      reader.store.add(widget);
    }));
  }
  /**
   * Whether the actions container should be shown for the given session state.
   * Standard layout shows it for non-untitled sessions; {@link SinglePaneChangesViewPane}
   * never shows it (the actions live in the Changes editor).
   */
  isActionsContainerVisible(isUntitled) {
    return !isUntitled;
  }
  /**
   * Whether clicking a file opens the modal single-file diff. {@link SinglePaneChangesViewPane}
   * never uses the modal editor.
   */
  shouldOpenModalDiff() {
    return this.configurationService.getValue("workbench.editor.useModal") === "all";
  }
  /**
   * Whether clicking a file opens a single-file diff by default (vs the
   * multi-file diff editor). Alt inverts this.
   */
  shouldOpenSingleFileDiffByDefault() {
    return this.configurationService.getValue(SESSIONS_CHANGES_OPEN_SINGLE_FILE_DIFF_SETTING);
  }
  /**
   * Reveal the CI checks section: expand it if collapsed and move keyboard
   * focus into it. No-op when there are no checks to show.
   */
  revealChecks() {
    if (!this.ciStatusWidget || !this.ciStatusWidget.visible) {
      return;
    }
    this.ciStatusWidget.expand();
    this.ciStatusWidget.focus();
  }
  async _openFileItem(item, items, sideBySide, preserveFocus, pinned, includeSidebar) {
    const { uri: modifiedFileUri, originalUri, isDeletion } = item;
    const currentIndex = items.indexOf(item);
    const sidebar = includeSidebar ? {
      render: (container, onDidLayout, contextKeyService) => {
        return this.renderSidebarList(container, onDidLayout, contextKeyService, items, this._openFileItem.bind(this));
      }
    } : void 0;
    const navigation = {
      total: items.length,
      current: currentIndex,
      navigate: (index) => {
        const target = items[index];
        if (target) {
          this._openFileItem(target, items, false, false, false, includeSidebar);
        }
      }
    };
    const group = sideBySide ? SIDE_GROUP : ACTIVE_GROUP;
    const labels = getChangesEditorLabels(item.uri, this.labelService);
    if (isDeletion && originalUri) {
      this.editorService.openEditor({
        resource: originalUri,
        ...labels,
        options: { preserveFocus, pinned, modal: { sidebar, navigation } }
      }, group);
      return;
    }
    if (originalUri) {
      this.editorService.openEditor({
        original: { resource: originalUri },
        modified: { resource: modifiedFileUri },
        ...labels,
        options: { preserveFocus, pinned, modal: { sidebar, navigation } }
      }, group);
      return;
    }
    this.editorService.openEditor({
      resource: modifiedFileUri,
      ...labels,
      options: { preserveFocus, pinned, modal: { sidebar, navigation } }
    }, group);
  }
  async _openSingleFileDiffEditor(item, sideBySide, preserveFocus, pinned) {
    const { uri, originalUri, isDeletion } = item;
    const group = sideBySide ? SIDE_GROUP : ACTIVE_GROUP;
    const labels = getChangesEditorLabels(uri, this.labelService);
    const modifiedUri = isDeletion ? void 0 : uri;
    const pane = await this.editorService.openEditor({
      original: { resource: originalUri },
      modified: { resource: modifiedUri },
      ...labels,
      options: { preserveFocus, pinned }
    }, group);
    const control = pane?.getControl();
    if (pane && isDiffEditor(control)) {
      const openedInput = pane.input;
      control.updateOptions({ hideUnchangedRegions: { enabled: false } });
      const listener = pane.group.onDidActiveEditorChange(() => {
        if (pane.group.activeEditor === openedInput) {
          return;
        }
        listener.dispose();
        control.updateOptions({ hideUnchangedRegions: { enabled: this.configurationService.getValue("diffEditor.hideUnchangedRegions.enabled") } });
      });
      this._register(listener);
    }
  }
  async _openMultiFileDiffEditor(reveal) {
    const sessionResource = this.changesViewService.activeSessionResourceObs.get();
    const changes = this.changesViewService.activeSessionChangesObs.get();
    if (!sessionResource || changes.length === 0) {
      return;
    }
    this.workbenchLayoutService.revealEditorPartExplicitly();
    let options;
    if (reveal) {
      const target = changes.find((c) => isEqual(c.modifiedUri, reveal));
      if (target) {
        options = {
          viewState: {
            revealData: {
              resource: {
                original: target.originalUri,
                modified: target.modifiedUri
              }
            }
          }
        };
      }
    }
    await this.sessionChangesService.openChangesEditor(sessionResource, options);
  }
  dispose() {
    this.tree = void 0;
    super.dispose();
  }
};
ChangesViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IChangesViewService),
  __decorateParam(11, IEditorService),
  __decorateParam(12, ISessionsService),
  __decorateParam(13, ILabelService),
  __decorateParam(14, ILogService),
  __decorateParam(15, ITelemetryService),
  __decorateParam(16, ISessionChangesService),
  __decorateParam(17, IWorkbenchLayoutService)
], ChangesViewPane);
class SinglePaneChangesViewPane extends ChangesViewPane {
  createFilesHeader(_contentContainer) {
  }
  createActionsButtonBar() {
  }
  isActionsContainerVisible(_isUntitled) {
    return false;
  }
  shouldOpenModalDiff() {
    return false;
  }
}
let ChangesViewPaneContainer = class extends ViewPaneContainer {
  constructor(layoutService, telemetryService, instantiationService, contextMenuService, themeService, storageService, configurationService, extensionService, contextService, viewDescriptorService, logService) {
    super(CHANGES_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService);
  }
  create(parent) {
    super.create(parent);
    parent.classList.add("changes-viewlet");
  }
};
ChangesViewPaneContainer = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IViewDescriptorService),
  __decorateParam(10, ILogService)
], ChangesViewPaneContainer);
class ChangesViewActionRunner extends ActionRunner {
  constructor(getSessionResource, getSessionDiscardRef, getSelectedFileItems) {
    super();
    this.getSessionResource = getSessionResource;
    this.getSessionDiscardRef = getSessionDiscardRef;
    this.getSelectedFileItems = getSelectedFileItems;
  }
  async runAction(action, context) {
    if (!(action instanceof MenuItemAction)) {
      return super.runAction(action, context);
    }
    const sessionResource = this.getSessionResource();
    const discardRef = this.getSessionDiscardRef();
    const selection = this.getSelectedFileItems();
    const contextIsSelected = selection.some((s) => s === context);
    const actualContext = contextIsSelected ? selection : [context];
    const args = actualContext.map((e) => {
      if (ResourceTree.isResourceNode(e)) {
        return ResourceTree.collect(e);
      }
      return isChangesFileItem(e) ? [e] : [];
    }).flat();
    await action.run(sessionResource, discardRef, ...args.map((item) => item.uri));
  }
}
const _ChangesTreeDelegate = class _ChangesTreeDelegate {
  getHeight(_element) {
    return _ChangesTreeDelegate.ROW_HEIGHT;
  }
  getTemplateId(_element) {
    return ChangesTreeRenderer.TEMPLATE_ID;
  }
};
_ChangesTreeDelegate.ROW_HEIGHT = 22;
let ChangesTreeDelegate = _ChangesTreeDelegate;
class ChangesTreeSorter {
  constructor(viewMode) {
    this.viewMode = viewMode;
  }
  compare(a, b) {
    if (this.viewMode() === ChangesViewMode.List) {
      const aPath = a.uri.fsPath;
      const bPath = b.uri.fsPath;
      return comparePaths(aPath, bPath);
    }
    const aIsDirectory = ResourceTree.isResourceNode(a);
    const bIsDirectory = ResourceTree.isResourceNode(b);
    if (aIsDirectory !== bIsDirectory) {
      return aIsDirectory ? -1 : 1;
    }
    const aName = ResourceTree.isResourceNode(a) ? a.name : basename(a.uri);
    const bName = ResourceTree.isResourceNode(b) ? b.name : basename(b.uri);
    return compareFileNames(aName, bName);
  }
}
class SetChangesListViewModeAction extends ViewAction {
  constructor() {
    super({
      id: "workbench.changesView.action.setListViewMode",
      title: localize("setListViewMode", "View as List"),
      viewId: CHANGES_VIEW_ID,
      f1: false,
      icon: Codicon.listFlat,
      toggled: ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.List),
      menu: {
        id: MenuId.ChatEditingSessionTitleToolbar,
        group: "1_viewmode",
        order: 1
      }
    });
  }
  async runInView(accessor, _view) {
    logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.List);
    accessor.get(IChangesViewService).setViewMode(ChangesViewMode.List);
  }
}
class SetChangesTreeViewModeAction extends ViewAction {
  constructor() {
    super({
      id: "workbench.changesView.action.setTreeViewMode",
      title: localize("setTreeViewMode", "View as Tree"),
      viewId: CHANGES_VIEW_ID,
      f1: false,
      icon: Codicon.listTree,
      toggled: ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.Tree),
      menu: {
        id: MenuId.ChatEditingSessionTitleToolbar,
        group: "1_viewmode",
        order: 2
      }
    });
  }
  async runInView(accessor, _view) {
    logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.Tree);
    accessor.get(IChangesViewService).setViewMode(ChangesViewMode.Tree);
  }
}
registerAction2(SetChangesListViewModeAction);
registerAction2(SetChangesTreeViewModeAction);
const _VersionsPickerAction = class _VersionsPickerAction extends Action2 {
  constructor() {
    super({
      id: _VersionsPickerAction.ID,
      title: localize2("chatEditing.versionsPicker", "Versions"),
      category: CHAT_CATEGORY,
      icon: Codicon.listFilter,
      f1: false,
      menu: [{
        id: MenuId.ChatEditingSessionChangesFileHeaderToolbar,
        group: "navigation",
        order: 9,
        when: ActiveSessionContextKeys.HasGitRepository
      }, {
        id: Menus.SessionsEditorHeaderPrimary,
        group: "navigation",
        order: 1,
        when: ActiveSessionContextKeys.HasGitRepository
      }]
    });
  }
  async run() {
  }
};
_VersionsPickerAction.ID = "chatEditing.versionsPicker";
let VersionsPickerAction = _VersionsPickerAction;
registerAction2(VersionsPickerAction);
let ChangesPickerActionItem = class extends ActionWidgetDropdownActionViewItem {
  constructor(action, actionWidgetService, keybindingService, contextKeyService, changesViewService, telemetryService) {
    const actionProvider = {
      getActions: () => {
        const changesets = changesViewService.activeSessionChangesetsObs.get() ?? [];
        const selectedChangeset = changesViewService.activeSessionChangesetObs.get();
        return changesets.map((changeset) => ({
          ...action,
          id: `agents.changes.changeset.${changeset.id}`,
          label: changeset.label,
          detail: changeset.description,
          checked: selectedChangeset?.id === changeset.id,
          category: {
            label: changeset.category ?? "",
            showHeader: false,
            order: 0
          },
          enabled: changeset.isEnabled.get(),
          run: async () => {
            changesViewService.setChangesetId(changeset.id);
            logChangesViewVersionModeChange(this.telemetryService, changeset.id);
          }
        }));
      }
    };
    super(action, { actionProvider, listOptions: { detailItemHeight: 44 } }, actionWidgetService, keybindingService, contextKeyService, telemetryService);
    this.changesViewService = changesViewService;
    this.telemetryService = telemetryService;
    this._register(autorun((reader) => {
      changesViewService.activeSessionChangesetObs.read(reader);
      if (this.element) {
        this.renderLabel(this.element);
      }
    }));
  }
  render(container) {
    super.render(container);
    container.classList.add("changes-picker-action-rich");
  }
  renderLabel(element) {
    const changeset = this.changesViewService.activeSessionChangesetObs.get();
    if (!changeset) {
      return null;
    }
    dom.reset(element, dom.$("span", void 0, changeset.label), ...renderLabelWithIcons("$(chevron-down)"));
    this.updateAriaLabel();
    return null;
  }
};
ChangesPickerActionItem = __decorateClass([
  __decorateParam(1, IActionWidgetService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IChangesViewService),
  __decorateParam(5, ITelemetryService)
], ChangesPickerActionItem);
const _ChangesDiffStatsAction = class _ChangesDiffStatsAction extends Action2 {
  constructor() {
    super({
      id: _ChangesDiffStatsAction.ID,
      title: localize2("changesView.viewChanges", "View All Changes"),
      f1: false,
      menu: [{
        id: MenuId.ChatEditingSessionChangesFileHeaderRightToolbar,
        group: "navigation",
        order: 1,
        when: ChatContextKeys.hasAgentSessionChanges
      }, {
        id: Menus.SessionsEditorHeaderPrimary,
        group: "navigation",
        order: 2,
        when: ChatContextKeys.hasAgentSessionChanges
      }]
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(CHANGES_VIEW_ID);
    await view?.openChanges();
  }
};
_ChangesDiffStatsAction.ID = "workbench.changesView.action.viewChanges";
let ChangesDiffStatsAction = _ChangesDiffStatsAction;
registerAction2(ChangesDiffStatsAction);
const _RevealCIChecksAction = class _RevealCIChecksAction extends Action2 {
  constructor() {
    super({
      id: _RevealCIChecksAction.ID,
      title: localize2("revealChecks", "Reveal Checks"),
      category: CHAT_CATEGORY,
      f1: false
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = await viewsService.openView(CHANGES_VIEW_ID, true);
    view?.revealChecks();
  }
};
_RevealCIChecksAction.ID = REVEAL_CI_CHECKS_COMMAND_ID;
let RevealCIChecksAction = _RevealCIChecksAction;
registerAction2(RevealCIChecksAction);
let ChangesDiffStatsActionItem = class extends ActionViewItem {
  constructor(action, options, instantiationService) {
    super(null, action, { ...options, icon: false, label: false });
    this._widget = this._register(instantiationService.createInstance(ChangesSummaryWidget));
    this._register(autorun((reader) => {
      const changesSummary = this._widget.summary.read(reader);
      if (changesSummary === void 0) {
        return;
      }
      this.updateTooltip();
    }));
  }
  render(container) {
    super.render(container);
    container.classList.add("changes-diff-stats-action");
    if (!this.label) {
      return;
    }
    this.renderLabelContents(this.label);
  }
  /**
   * Renders the diff-stats content into the action label. The base shows the
   * animated +/- summary; {@link SinglePaneChangesDiffStatsActionItem} overrides
   * this to a richer "N files +X -Y" label for the single-pane editor header.
   */
  renderLabelContents(label) {
    this._widget.render(label);
  }
  getTooltip() {
    const changesSummary = this._widget.summary.get();
    if (changesSummary === void 0) {
      return void 0;
    }
    const { files, additions, deletions } = changesSummary;
    return localize("changesView.diffStats.label", "{0} files, {1} additions, {2} deletions", files, additions, deletions);
  }
};
ChangesDiffStatsActionItem = __decorateClass([
  __decorateParam(2, IInstantiationService)
], ChangesDiffStatsActionItem);
class SinglePaneChangesDiffStatsActionItem extends ChangesDiffStatsActionItem {
  render(container) {
    super.render(container);
    container.classList.add("changes-diff-stats-action-rich");
  }
  renderLabelContents(label) {
    this._register(autorun((reader) => {
      const summary = this._widget.summary.read(reader);
      if (summary === void 0) {
        return;
      }
      const { files, additions, deletions } = summary;
      const filesLabel = files === 1 ? localize("changesView.diffStats.file", "1 file") : localize("changesView.diffStats.files", "{0} files", files);
      dom.reset(
        label,
        dom.$("span.changes-diff-stats-files", void 0, filesLabel),
        dom.$("span.working-set-lines-added", void 0, `+${additions}`),
        dom.$("span.working-set-lines-removed", void 0, `-${deletions}`)
      );
    }));
  }
}
export {
  CHANGES_HEADER_ACTIONS_ID,
  ChangesActionsBar,
  ChangesActionsBarActionViewItem,
  ChangesPickerActionItem,
  ChangesViewPane,
  ChangesViewPaneContainer,
  SinglePaneChangesDiffStatsActionItem,
  SinglePaneChangesViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhbmdlcy9icm93c2VyL2NoYW5nZXNWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYW5nZXNWaWV3LmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSwgQmFzZUFjdGlvblZpZXdJdGVtLCBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElPYmplY3RUcmVlRWxlbWVudCwgSVRyZWVTb3J0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IEFjdGlvblJ1bm5lciwgSUFjdGlvbiwgU2VwYXJhdG9yLCBTdWJtZW51QWN0aW9uLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZSwgSU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgQ291bnRCYWRnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb3VudEJhZGdlL2NvdW50QmFkZ2UuanMnO1xuaW1wb3J0IHsgUHJvZ3Jlc3NCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcHJvZ3Jlc3NiYXIvcHJvZ3Jlc3NiYXIuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudVdvcmtiZW5jaEJ1dHRvbkJhciwgV29ya2JlbmNoQnV0dG9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2J1dHRvbmJhci5qcyc7XG5pbXBvcnQgeyBnZXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgTWVudUlkLCBBY3Rpb24yLCBNZW51SXRlbUFjdGlvbiwgcmVnaXN0ZXJBY3Rpb24yLCBJTWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbiwgSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXREcm9wZG93bi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBiaW5kQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRlZmF1bHRDb3VudEJhZGdlU3R5bGVzLCBkZWZhdWx0UHJvZ3Jlc3NCYXJTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgZmlsbEVkaXRvcnNEcmFnRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZSwgSVZpZXdQYW5lT3B0aW9ucywgVmlld0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IFZpZXdQYW5lQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmVDb250YWluZXIuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUZpbGVJY29uVGhlbWFibGVUcmVlQ29udGFpbmVyU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9maWxlcy9icm93c2VyL3ZpZXdzL2V4cGxvcmVyVmlldy5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU11bHRpRGlmZkVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvbXVsdGlEaWZmRWRpdG9yL211bHRpRGlmZkVkaXRvcldpZGdldEltcGwuanMnO1xuaW1wb3J0IHsgaXNEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBnZXRDaGFuZ2VzRWRpdG9yTGFiZWxzIH0gZnJvbSAnLi9jaGFuZ2VzRWRpdG9yTGFiZWxzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uQ2hhbmdlc1NlcnZpY2UgfSBmcm9tICcuL3Nlc3Npb25DaGFuZ2VzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ0lTdGF0dXNXaWRnZXQgfSBmcm9tICcuL2NoZWNrc1dpZGdldC5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uRmlsZXNXaWRnZXQgfSBmcm9tICcuL3Nlc3Npb25GaWxlc1dpZGdldC5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uRmlsZXNWaWV3TW9kZWwgfSBmcm9tICcuL3Nlc3Npb25GaWxlc1ZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FLCBJU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvbiwgU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblNjb3BlLCBTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgaXNBZ2VudEhvc3RQcm92aWRlcklkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgT3JpZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IElWaWV3LCBMYXlvdXRQcmlvcml0eSwgU2l6aW5nLCBTcGxpdFZpZXcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc3BsaXR2aWV3L3NwbGl0dmlldy5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IFBBTkVMX1NFQ1RJT05fQk9SREVSIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBTaWRlQnlTaWRlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgbG9nQ2hhbmdlc1ZpZXdGaWxlU2VsZWN0LCBsb2dDaGFuZ2VzVmlld1ZlcnNpb25Nb2RlQ2hhbmdlLCBsb2dDaGFuZ2VzVmlld1ZpZXdNb2RlQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25zVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IENoZWNrc1ZpZXdNb2RlbCB9IGZyb20gJy4vY2hlY2tzVmlld01vZGVsLmpzJztcbmltcG9ydCB7IFJFVkVBTF9DSV9DSEVDS1NfQ09NTUFORF9JRCB9IGZyb20gJy4vY2hlY2tzQWN0aW9ucy5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnMgLS0gVE9ETzogbW92ZSBza2lsbCBidXR0b24gY29uc3RhbnRzIG91dCBvZiBwcm92aWRlcnNcbmltcG9ydCB7IEFHRU5UX0hPU1RfU0tJTExfQlVUVE9OX1VQREFURV9QUl9JRCwgaXNBZ2VudEhvc3RTa2lsbEJ1dHRvbklkIH0gZnJvbSAnLi4vLi4vcHJvdmlkZXJzL2FnZW50SG9zdC9icm93c2VyL2FnZW50SG9zdFNraWxsQnV0dG9ucy5qcyc7XG5pbXBvcnQgeyBBY3RpdmVTZXNzaW9uQ29udGV4dEtleXMsIENIQU5HRVNfVklFV19DT05UQUlORVJfSUQsIENIQU5HRVNfVklFV19JRCwgQ2hhbmdlc0NvbnRleHRLZXlzLCBDaGFuZ2VzVmlld01vZGUsIElzb2xhdGlvbk1vZGUsIFNFU1NJT05TX0NIQU5HRVNfT1BFTl9TSU5HTEVfRklMRV9ESUZGX1NFVFRJTkcgfSBmcm9tICcuLi9jb21tb24vY2hhbmdlcy5qcyc7XG5pbXBvcnQgeyBidWlsZFRyZWVDaGlsZHJlbiwgQ2hhbmdlc1RyZWVFbGVtZW50LCBDaGFuZ2VzVHJlZVJlbmRlcmVyLCBJQ2hhbmdlc0ZpbGVJdGVtLCBJQ2hhbmdlc1RyZWVSb290SW5mbywgaXNDaGFuZ2VzRmlsZUl0ZW0sIHRvSUNoYW5nZXNGaWxlSXRlbSB9IGZyb20gJy4vY2hhbmdlc1ZpZXdSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZVRyZWUuanMnO1xuaW1wb3J0IHsgY29tcGFyZUZpbGVOYW1lcywgY29tcGFyZVBhdGhzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29tcGFyZXJzLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElDaGFuZ2VzVmlld1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY2hhbmdlc1ZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYW5nZXNTdW1tYXJ5V2lkZ2V0IH0gZnJvbSAnLi9jaGFuZ2VzU3VtbWFyeVdpZGdldC5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd29ya2JlbmNoLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG4vLyAtLS0gQ29uc3RhbnRzXG5cbmNvbnN0IFJVTl9TRVNTSU9OX0NPREVfUkVWSUVXX0FDVElPTl9JRCA9ICdzZXNzaW9ucy5jb2RlUmV2aWV3LnJ1bic7XG5jb25zdCBWRVJTSU9OU19QSUNLRVJfQUNUSU9OX0lEID0gJ2NoYXRFZGl0aW5nLnZlcnNpb25zUGlja2VyJztcbmNvbnN0IERJRkZfU1RBVFNfQUNUSU9OX0lEID0gJ3dvcmtiZW5jaC5jaGFuZ2VzVmlldy5hY3Rpb24udmlld0NoYW5nZXMnO1xuY29uc3QgRU1QVFlfRklMRV9DSEFOR0VTX01JTl9IRUlHSFQgPSAxNDA7XG5cbi8qKiBNYXhpbXVtIG51bWJlciBvZiBmaWxlIHJvd3MgdGhlIHRyZWUgcGFuZSdzIG1pbmltdW0gc2l6ZSBncm93cyB0byBhY2NvbW1vZGF0ZS4gKi9cbmNvbnN0IFRSRUVfUEFORV9NSU5fU0laRV9NQVhfUk9XUyA9IDEzO1xuXG4vKiogQnJlYXRoaW5nIHJvb20gcmVuZGVyZWQgYmVuZWF0aCB0aGUgbGFzdCBmaWxlIHJvdyB3aGVuIHRoZSB3aG9sZSBsaXN0IGZpdHMuICovXG5jb25zdCBUUkVFX1BBTkVfTElTVF9CT1RUT01fUEFERElORyA9IDEyO1xuXG4vLyAtLS0gQnV0dG9uQmFyIHdpZGdldFxuXG4vKipcbiAqIENvbW1vbiBzdXJmYWNlIGZvciB0aGUgY2hhbmdlcyBhY3Rpb24gYnV0dG9uLWJhciB3aWRnZXRzIHNvIGhvc3RzIChlLmcuIHRoZVxuICogZWRpdG9yLXRpdGxlIGFjdGlvbnMgYmFyKSBjYW4gcmVhY3QgdG8gYW5kIHF1ZXJ5IHdoZXRoZXIgYW55IGFjdGlvbiByZW5kZXJlZC5cbiAqL1xuaW50ZXJmYWNlIElDaGFuZ2VzQnV0dG9uQmFyV2lkZ2V0IGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHQvKiogRmlyZXMgd2hlbmV2ZXIgdGhlIHJlbmRlcmVkIGFjdGlvbnMgY2hhbmdlLiAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGlvbnM6IEV2ZW50PHZvaWQ+O1xuXHQvKiogV2hldGhlciB0aGUgd2lkZ2V0IGN1cnJlbnRseSByZW5kZXJzIGF0IGxlYXN0IG9uZSBhY3Rpb24uICovXG5cdHJlYWRvbmx5IGhhc0FjdGlvbnM6IGJvb2xlYW47XG59XG5cbmNsYXNzIENoYW5nZXNNZW51V29ya2JlbmNoQnV0dG9uQmFyV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGFuZ2VzQnV0dG9uQmFyV2lkZ2V0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3Rpb25zID0gdGhpcy5fb25EaWRDaGFuZ2VBY3Rpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgX2N1cnJlbnRCdXR0b25CYXI6IE1lbnVXb3JrYmVuY2hCdXR0b25CYXIgfCB1bmRlZmluZWQ7XG5cdGdldCBoYXNBY3Rpb25zKCk6IGJvb2xlYW4geyByZXR1cm4gKHRoaXMuX2N1cnJlbnRCdXR0b25CYXI/LmJ1dHRvbnMubGVuZ3RoID8/IDApID4gMDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0aGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc09iczogSU9ic2VydmFibGU8Ym9vbGVhbj4sXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ2hhbmdlc1ZpZXdTZXJ2aWNlIGNoYW5nZXNWaWV3U2VydmljZTogSUNoYW5nZXNWaWV3U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBvdXRnb2luZ0NoYW5nZXNPYnMgPSBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZTxudW1iZXIgfCB1bmRlZmluZWQ+KHRoaXMsIChyZWFkZXIsIGxhc3RWYWx1ZSkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvblN0YXRlID0gY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25TdGF0ZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzID0gaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzcykge1xuXHRcdFx0XHRyZXR1cm4gbGFzdFZhbHVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gYWN0aXZlU2Vzc2lvblN0YXRlPy5vdXRnb2luZ0NoYW5nZXM7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBydW5uaW5nTGFiZWxPYnMgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gQ2xlYXIgdGhlIHJ1bm5pbmcgbGFiZWwgb3ZlcnJpZGVcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRpZiAoIWhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3NPYnMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJ1bm5pbmdMYWJlbE9icy5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3MgPSBoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2VPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgb3V0Z29pbmdDaGFuZ2VzID0gb3V0Z29pbmdDaGFuZ2VzT2JzLnJlYWQocmVhZGVyKSA/PyAwO1xuXG5cdFx0XHRjb25zdCBidXR0b25CYXIgPSBuZXcgTWVudVdvcmtiZW5jaEJ1dHRvbkJhcihcblx0XHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0XHRNZW51SWQuQWdlbnRzQ2hhbmdlc1Rvb2xiYXIsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0ZWxlbWV0cnlTb3VyY2U6ICdjaGFuZ2VzVmlldycsXG5cdFx0XHRcdFx0bWVudU9wdGlvbnM6IHNlc3Npb25SZXNvdXJjZVxuXHRcdFx0XHRcdFx0PyB7IGFyZzogc2Vzc2lvblJlc291cmNlIH1cblx0XHRcdFx0XHRcdDogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9LFxuXHRcdFx0XHRcdGJ1dHRvbkNvbmZpZ1Byb3ZpZGVyOiAoYWN0aW9uKSA9PiB0aGlzLl9nZXRCdXR0b25Db25maWd1cmF0aW9uKGFjdGlvbiwgb3V0Z29pbmdDaGFuZ2VzLCBoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzLCBydW5uaW5nTGFiZWxPYnMpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1lbnVTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSwgaG92ZXJTZXJ2aWNlXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBTZXQgdGhlIHJ1bm5pbmcgbGFiZWwgb3ZlcnJpZGVcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQoYnV0dG9uQmFyLm9uV2lsbFJ1bihlID0+IHJ1bm5pbmdMYWJlbE9icy5zZXQoZS5hY3Rpb24ubGFiZWwsIHVuZGVmaW5lZCkpKTtcblxuXHRcdFx0dGhpcy5fY3VycmVudEJ1dHRvbkJhciA9IGJ1dHRvbkJhcjtcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQoYnV0dG9uQmFyLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlQWN0aW9ucy5maXJlKCkpKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aW9ucy5maXJlKCk7XG5cblx0XHRcdHJlYWRlci5zdG9yZS5hZGQoYnV0dG9uQmFyKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRCdXR0b25Db25maWd1cmF0aW9uKGFjdGlvbjogSUFjdGlvbiwgb3V0Z29pbmdDaGFuZ2VzOiBudW1iZXIsIGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3M6IGJvb2xlYW4sIHJ1bm5pbmdMYWJlbE9iczogSU9ic2VydmFibGU8c3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkPik6IHsgc2hvd0ljb246IGJvb2xlYW47IHNob3dMYWJlbDogYm9vbGVhbjsgaXNTZWNvbmRhcnk/OiBib29sZWFuOyBjdXN0b21MYWJlbD86IHN0cmluZyB8IElNYXJrZG93blN0cmluZzsgY3VzdG9tTGFiZWxPYnM/OiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ+OyBjdXN0b21DbGFzcz86IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoXG5cdFx0XHRhY3Rpb24uaWQgPT09ICdnaXRodWIuY29waWxvdC5zZXNzaW9ucy5jb21taXQnIHx8XG5cdFx0XHRhY3Rpb24uaWQgPT09ICdnaXRodWIuY29waWxvdC5jaGF0LmNyZWF0ZVB1bGxSZXF1ZXN0Q29waWxvdENMSUFnZW50U2Vzc2lvbi5jcmVhdGVQUidcblx0XHQpIHtcblx0XHRcdGlmICghaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzcykge1xuXHRcdFx0XHRyZXR1cm4geyBzaG93SWNvbjogdHJ1ZSwgc2hvd0xhYmVsOiB0cnVlLCBpc1NlY29uZGFyeTogZmFsc2UgfTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGN1c3RvbUxhYmVsT2JzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBydW5uaW5nID0gcnVubmluZ0xhYmVsT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0cmV0dXJuIGAkKGxvYWRpbmcpICR7cnVubmluZyA/PyBhY3Rpb24ubGFiZWx9YDtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHsgc2hvd0ljb246IGZhbHNlLCBzaG93TGFiZWw6IHRydWUsIGlzU2Vjb25kYXJ5OiBmYWxzZSwgY3VzdG9tTGFiZWxPYnMgfTtcblx0XHR9XG5cdFx0aWYgKFxuXHRcdFx0YWN0aW9uLmlkID09PSAnZ2l0aHViLmNvcGlsb3Quc2Vzc2lvbnMuc3luYycgfHxcblx0XHRcdGFjdGlvbi5pZCA9PT0gJ2dpdGh1Yi5jb3BpbG90LnNlc3Npb25zLmNvbW1pdEFuZFN5bmMnXG5cdFx0KSB7XG5cdFx0XHRjb25zdCBsYWJlbFdpdGhDb3VudCA9IG91dGdvaW5nQ2hhbmdlcyA+IDBcblx0XHRcdFx0PyBgJHthY3Rpb24ubGFiZWx9ICR7b3V0Z29pbmdDaGFuZ2VzfVx1MjE5MWBcblx0XHRcdFx0OiBgJHthY3Rpb24ubGFiZWx9YDtcblx0XHRcdGlmICghaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzcykge1xuXHRcdFx0XHRyZXR1cm4geyBzaG93SWNvbjogdHJ1ZSwgc2hvd0xhYmVsOiB0cnVlLCBpc1NlY29uZGFyeTogZmFsc2UsIGN1c3RvbUxhYmVsOiBsYWJlbFdpdGhDb3VudCB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgc2hvd0ljb246IGZhbHNlLCBzaG93TGFiZWw6IHRydWUsIGlzU2Vjb25kYXJ5OiBmYWxzZSwgY3VzdG9tTGFiZWw6IGAkKGxvYWRpbmcpICR7bGFiZWxXaXRoQ291bnR9YCB9O1xuXHRcdH1cblx0XHRpZiAoXG5cdFx0XHRhY3Rpb24uaWQgPT09ICdnaXRodWIuY29waWxvdC5jbGF1ZGUuc2Vzc2lvbnMuc3luYycgfHxcblx0XHRcdGFjdGlvbi5pZCA9PT0gQUdFTlRfSE9TVF9TS0lMTF9CVVRUT05fVVBEQVRFX1BSX0lEXG5cdFx0KSB7XG5cdFx0XHRjb25zdCBjdXN0b21MYWJlbCA9IG91dGdvaW5nQ2hhbmdlcyA+IDBcblx0XHRcdFx0PyBgJHthY3Rpb24ubGFiZWx9ICR7b3V0Z29pbmdDaGFuZ2VzfVx1MjE5MWBcblx0XHRcdFx0OiBhY3Rpb24ubGFiZWw7XG5cdFx0XHRyZXR1cm4geyBjdXN0b21MYWJlbCwgc2hvd0ljb246IHRydWUsIHNob3dMYWJlbDogdHJ1ZSwgaXNTZWNvbmRhcnk6IGZhbHNlIH07XG5cdFx0fVxuXHRcdGlmIChcblx0XHRcdGFjdGlvbi5pZCA9PT0gUlVOX1NFU1NJT05fQ09ERV9SRVZJRVdfQUNUSU9OX0lEIHx8XG5cdFx0XHRhY3Rpb24uaWQgPT09ICdjaGF0RWRpdGluZy52aWV3QWxsU2Vzc2lvbkNoYW5nZXMnIHx8XG5cdFx0XHRhY3Rpb24uaWQgPT09ICdnaXRodWIuY29waWxvdC5jaGF0Lm9wZW5QdWxsUmVxdWVzdENvcGlsb3RDTElBZ2VudFNlc3Npb24ub3BlblBSJ1xuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHsgc2hvd0ljb246IHRydWUsIHNob3dMYWJlbDogZmFsc2UsIGlzU2Vjb25kYXJ5OiB0cnVlIH07XG5cdFx0fVxuXHRcdGlmIChhY3Rpb24uaWQgPT09ICdhZ2VudEZlZWRiYWNrRWRpdG9yLmFjdGlvbi5zdWJtaXRBY3RpdmVTZXNzaW9uJykge1xuXHRcdFx0cmV0dXJuIHsgc2hvd0ljb246IGZhbHNlLCBzaG93TGFiZWw6IHRydWUsIGlzU2Vjb25kYXJ5OiBmYWxzZSB9O1xuXHRcdH1cblx0XHRpZiAoXG5cdFx0XHRhY3Rpb24uaWQgPT09ICdnaXRodWIuY29waWxvdC5jaGF0LmNyZWF0ZVB1bGxSZXF1ZXN0Q29waWxvdENMSUFnZW50U2Vzc2lvbi5jcmVhdGVQUicgfHxcblx0XHRcdGFjdGlvbi5pZCA9PT0gJ2dpdGh1Yi5jb3BpbG90LmNoYXQubWVyZ2VDb3BpbG90Q0xJQWdlbnRTZXNzaW9uQ2hhbmdlcy5tZXJnZScgfHxcblx0XHRcdGFjdGlvbi5pZCA9PT0gJ2dpdGh1Yi5jb3BpbG90LmNoYXQuY2hlY2tvdXRQdWxsUmVxdWVzdFJlcm91dGUnIHx8XG5cdFx0XHRhY3Rpb24uaWQgPT09ICdwci5jaGVja291dEZyb21DaGF0JyB8fFxuXHRcdFx0YWN0aW9uLmlkID09PSAnZ2l0aHViLmNvcGlsb3Quc2Vzc2lvbnMuaW5pdGlhbGl6ZVJlcG9zaXRvcnknIHx8XG5cdFx0XHRhY3Rpb24uaWQgPT09ICdnaXRodWIuY29waWxvdC5jbGF1ZGUuc2Vzc2lvbnMuaW5pdGlhbGl6ZVJlcG9zaXRvcnknIHx8XG5cdFx0XHRhY3Rpb24uaWQgPT09ICdnaXRodWIuY29waWxvdC5jbGF1ZGUuc2Vzc2lvbnMuY29tbWl0JyB8fFxuXHRcdFx0YWN0aW9uLmlkID09PSAnZ2l0aHViLmNvcGlsb3QuY2xhdWRlLnNlc3Npb25zLmNvbW1pdEFuZFN5bmMnIHx8XG5cdFx0XHRhY3Rpb24uaWQgPT09ICdhZ2VudFNlc3Npb24ucmVzdG9yZScgfHxcblx0XHRcdGFjdGlvbi5pZCA9PT0gJ3Nlc3Npb25zLmFjdGlvbi5maXhDSUNoZWNrcycgfHxcblx0XHRcdGlzQWdlbnRIb3N0U2tpbGxCdXR0b25JZChhY3Rpb24uaWQpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4geyBzaG93SWNvbjogdHJ1ZSwgc2hvd0xhYmVsOiB0cnVlLCBpc1NlY29uZGFyeTogZmFsc2UgfTtcblx0XHR9XG5cblx0XHQvLyBVbmtub3duIGFjdGlvbnMgKGUuZy4gZXh0ZW5zaW9uLWNvbnRyaWJ1dGVkKTogb25seSBoaWRlIHRoZSBsYWJlbCB3aGVuIGFuIGljb24gaXMgcHJlc2VudC5cblx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdGNvbnN0IGljb24gPSBhY3Rpb24uaXRlbS5pY29uO1xuXHRcdFx0aWYgKGljb24pIHtcblx0XHRcdFx0Ly8gSWNvbi1vbmx5IGJ1dHRvbiAobm8gZm9yY2VkIHNlY29uZGFyeSBzdGF0ZSBzbyBwcmltYXJ5L3NlY29uZGFyeSBjYW4gYmUgaW5mZXJyZWQpLlxuXHRcdFx0XHRyZXR1cm4geyBzaG93SWNvbjogdHJ1ZSwgc2hvd0xhYmVsOiBmYWxzZSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZhbGwgYmFjayB0byBkZWZhdWx0IGJ1dHRvbiBiZWhhdmlvciBmb3IgYWN0aW9ucyB3aXRob3V0IGFuIGljb24uXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vLyAtLS0gQnV0dG9uQmFyIHdpZGdldCAoQWdlbnQgSG9zdClcblxuY2xhc3MgQ2hhbmdlc1dvcmtiZW5jaEJ1dHRvbkJhcldpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhbmdlc0J1dHRvbkJhcldpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYnV0dG9uQmFyOiBXb3JrYmVuY2hCdXR0b25CYXI7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aW9uczogRXZlbnQ8dm9pZD47XG5cdGdldCBoYXNBY3Rpb25zKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fYnV0dG9uQmFyLmJ1dHRvbnMubGVuZ3RoID4gMDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ2hhbmdlc1ZpZXdTZXJ2aWNlIGNoYW5nZXNWaWV3U2VydmljZTogSUNoYW5nZXNWaWV3U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgbWVudSA9IHRoaXMuX3JlZ2lzdGVyKG1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLkFnZW50c0NoYW5nZXNUb29sYmFyLCBjb250ZXh0S2V5U2VydmljZSkpO1xuXG5cdFx0Y29uc3QgYnV0dG9uQmFyID0gdGhpcy5fYnV0dG9uQmFyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hCdXR0b25CYXIsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHR7XG5cdFx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ2NoYW5nZXNWaWV3Jyxcblx0XHRcdFx0YnV0dG9uQ29uZmlnUHJvdmlkZXI6IChfYWN0aW9uLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB7IHNob3dJY29uOiB0cnVlLCBzaG93TGFiZWw6IGluZGV4ID09PSAwIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlQWN0aW9ucyA9IEV2ZW50LnNpZ25hbChidXR0b25CYXIub25EaWRDaGFuZ2UpO1xuXG5cdFx0Y29uc3QgbWVudUFjdGlvbnNPYnMgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KG1lbnUub25EaWRDaGFuZ2UsICgpID0+IHtcblx0XHRcdHJldHVybiBnZXRBY3Rpb25CYXJBY3Rpb25zKG1lbnUuZ2V0QWN0aW9ucyh7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IG9wZXJhdGlvbkFjdGlvbkdyb3Vwc09icyA9IGRlcml2ZWQ8SUFjdGlvbltdW10+KHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjaGFuZ2VzZXQgPSBjaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWNoYW5nZXNldCkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9wZXJhdGlvbnMgPSBjaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvbnNPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgY2hhbmdlc2V0T3BlcmF0aW9ucyA9IG9wZXJhdGlvbnNcblx0XHRcdFx0LmZpbHRlcihvcCA9PiBvcC5zY29wZXMuaW5jbHVkZXMoU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblNjb3BlLkNoYW5nZXNldCkpO1xuXG5cdFx0XHRjb25zdCB0b09wZXJhdGlvbkFjdGlvbiA9IChvcDogSVNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb24pID0+IHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6IG9wLmlkLFxuXHRcdFx0XHRsYWJlbDogb3AuaWNvblxuXHRcdFx0XHRcdD8gb3Auc3RhdHVzID09PSBTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLlJ1bm5pbmdcblx0XHRcdFx0XHRcdD8gYCQobG9hZGluZykgJHtvcC5sYWJlbH1gXG5cdFx0XHRcdFx0XHQ6IGAkKCR7b3AuaWNvbi5pZH0pICR7b3AubGFiZWx9YFxuXHRcdFx0XHRcdDogb3Auc3RhdHVzID09PSBTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLlJ1bm5pbmdcblx0XHRcdFx0XHRcdD8gYCQobG9hZGluZykgJHtvcC5sYWJlbH1gXG5cdFx0XHRcdFx0XHQ6IG9wLmxhYmVsLFxuXHRcdFx0XHR0b29sdGlwOiBvcC5kZXNjcmlwdGlvbiA/PyBvcC5sYWJlbCxcblx0XHRcdFx0ZW5hYmxlZDogb3Auc3RhdHVzICE9PSBTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLkRpc2FibGVkICYmIG9wLnN0YXR1cyAhPT0gU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHRydW46ICgpID0+IGNoYW5nZXNldC5pbnZva2VPcGVyYXRpb24ob3AuaWQpLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEdyb3VwIHRoZSByZW1haW5pbmcgY2hhbmdlc2V0LXNjb3BlZCBvcGVyYXRpb25zIGJ5IHRoZWlyXG5cdFx0XHQvLyBncm91cCBpZGVudGlmaWVyLCBwcmVzZXJ2aW5nIHRoZSBvcmRlciBpbiB3aGljaCBncm91cHNcblx0XHRcdC8vIGFyZSBmaXJzdCBlbmNvdW50ZXJlZC5cblx0XHRcdGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nIHwgdW5kZWZpbmVkLCBJQWN0aW9uW10+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IG9wIG9mIGNoYW5nZXNldE9wZXJhdGlvbnMpIHtcblx0XHRcdFx0Ly8gU2tpcCB0aGUgcnVubmluZyBvcGVyYXRpb25zIGFzIHRoZXkgd2lsbCBiZSBoYW5kbGVkIHNlcGFyYXRlbHlcblx0XHRcdFx0aWYgKG9wLnN0YXR1cyA9PT0gU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5SdW5uaW5nKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSB0b09wZXJhdGlvbkFjdGlvbihvcCk7XG5cdFx0XHRcdGNvbnN0IGdyb3VwQWN0aW9ucyA9IGdyb3Vwcy5nZXQob3AuZ3JvdXApO1xuXHRcdFx0XHRpZiAoZ3JvdXBBY3Rpb25zKSB7XG5cdFx0XHRcdFx0Z3JvdXBBY3Rpb25zLnB1c2goYWN0aW9uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRncm91cHMuc2V0KG9wLmdyb3VwLCBbYWN0aW9uXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gUnVubmluZyBvcGVyYXRpb25zIGFyZSBleHRyYWN0ZWQgaW50byBhIGRlZGljYXRlZCBncm91cCB0aGF0IGFwcGVhcnMgZmlyc3Rcblx0XHRcdC8vIHNvIHRoYXQgdGhlIHJ1bm5pbmcgb3BlcmF0aW9uIGFjdHMgYXMgdGhlIHByaW1hcnkgYWN0aW9uIG9mIHRoZSBkcm9wZG93bi5cblx0XHRcdGNvbnN0IHJ1bm5pbmdBY3Rpb25zID0gY2hhbmdlc2V0T3BlcmF0aW9uc1xuXHRcdFx0XHQuZmlsdGVyKG9wID0+IG9wLnN0YXR1cyA9PT0gU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5SdW5uaW5nKVxuXHRcdFx0XHQubWFwKHRvT3BlcmF0aW9uQWN0aW9uKTtcblxuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0Li4uKHJ1bm5pbmdBY3Rpb25zLmxlbmd0aCA+IDBcblx0XHRcdFx0XHQ/IFtydW5uaW5nQWN0aW9uc11cblx0XHRcdFx0XHQ6IFtdKSxcblx0XHRcdFx0Li4uZ3JvdXBzLnZhbHVlcygpLFxuXHRcdFx0XTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGlzTG9hZGluZyA9IGNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uTG9hZGluZ09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoaXNMb2FkaW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3BlcmF0aW9uQWN0aW9uR3JvdXBzID0gb3BlcmF0aW9uQWN0aW9uR3JvdXBzT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IG1lbnVBY3Rpb25zID0gbWVudUFjdGlvbnNPYnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCBwcmltYXJ5QWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0XHRjb25zdCBvcGVyYXRpb25BY3Rpb25zID0gb3BlcmF0aW9uQWN0aW9uR3JvdXBzLmZsYXQoKTtcblxuXHRcdFx0aWYgKG9wZXJhdGlvbkFjdGlvbnMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHQvLyBUaGUgYWN0aW9uIGdyb3VwcyBhcmUgYnVpbGQgc28gdGhhdCB0aGVcblx0XHRcdFx0Ly8gcnVubmluZyBhY3Rpb24ocykgYXBwZWFyIGluIHRoZSBmaXJzdCBncm91cFxuXHRcdFx0XHRjb25zdCBwcmltYXJ5QWN0aW9uID0gb3BlcmF0aW9uQWN0aW9uc1swXTtcblxuXHRcdFx0XHQvLyBKb2luIHRoZSBncm91cHMgd2l0aCBzZXBhcmF0b3JzIHRvXG5cdFx0XHRcdC8vIHZpc3VhbGx5IHNlcGFyYXRlIHJlbGF0ZWQgb3BlcmF0aW9ucy5cblx0XHRcdFx0Y29uc3QgZHJvcGRvd25BY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBvcGVyYXRpb25BY3Rpb25Hcm91cHMpIHtcblx0XHRcdFx0XHRpZiAoZHJvcGRvd25BY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGRyb3Bkb3duQWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRyb3Bkb3duQWN0aW9ucy5wdXNoKC4uLmdyb3VwKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2gobmV3IFN1Ym1lbnVBY3Rpb24oJ2NoYW5nZXNWaWV3Lm9wZXJhdGlvbnMucHJpbWFyeS5kcm9wZG93bicsIHByaW1hcnlBY3Rpb24ubGFiZWwsIGRyb3Bkb3duQWN0aW9ucykpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaCguLi5vcGVyYXRpb25BY3Rpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaCguLi5tZW51QWN0aW9ucy5wcmltYXJ5KTtcblx0XHRcdGJ1dHRvbkJhci51cGRhdGUocHJpbWFyeUFjdGlvbnMsIG1lbnVBY3Rpb25zLnNlY29uZGFyeSk7XG5cdFx0fSkpO1xuXHR9XG59XG5cbi8qKlxuICogUmVuZGVycyB0aGUgc2Vzc2lvbiBjaGFuZ2VzIGFjdGlvbiBidXR0b24tYmFyIChlLmcuIFwiQ3JlYXRlIFB1bGwgUmVxdWVzdFwiKSBpbnRvXG4gKiBhIGNvbnRhaW5lciwgY2hvb3NpbmcgdGhlIGFnZW50LWhvc3Qgb3IgZ2l0IHZhcmlhbnQgYmFzZWQgb24gdGhlIGFjdGl2ZSBzZXNzaW9uLlxuICogVXNlZCB0byBob3N0IHRoZSBhY3Rpb25zIGluIHRoZSBzaW5nbGUtcGFuZSBDaGFuZ2VzIGVkaXRvciBoZWFkZXIuXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGFuZ2VzQWN0aW9uc0JhciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNoYW5nZXNWaWV3U2VydmljZSBjaGFuZ2VzVmlld1NlcnZpY2U6IElDaGFuZ2VzVmlld1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2Ugc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGFuZ2VzLWFjdGlvbnMtYmFyJyk7XG5cblx0XHRjb25zdCBoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzR2xvYmFsT2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudChjb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQsICgpID0+XG5cdFx0XHRjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoJ3Nlc3Npb25zLmhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3MnKSA9PT0gdHJ1ZSk7XG5cdFx0Y29uc3QgaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc09icyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGlmIChoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzR2xvYmFsT2JzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvblN0YXRlT2JzLnJlYWQocmVhZGVyKT8uaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzcyA9PT0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGlzQWdlbnRIb3N0U2Vzc2lvbk9icyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gYWN0aXZlU2Vzc2lvbiA/IGlzQWdlbnRIb3N0UHJvdmlkZXJJZChhY3RpdmVTZXNzaW9uLnByb3ZpZGVySWQpIDogZmFsc2U7XG5cdFx0fSk7XG5cblx0XHRsZXQgY3VycmVudFdpZGdldDogSUNoYW5nZXNCdXR0b25CYXJXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdXBkYXRlVmlzaWJpbGl0eSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHZpc2libGUgPSBjdXJyZW50V2lkZ2V0Py5oYXNBY3Rpb25zID8/IGZhbHNlO1xuXHRcdFx0ZG9tLnNldFZpc2liaWxpdHkodmlzaWJsZSwgY29udGFpbmVyKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0ZG9tLmNsZWFyTm9kZShjb250YWluZXIpO1xuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSBpc0FnZW50SG9zdFNlc3Npb25PYnMucmVhZChyZWFkZXIpXG5cdFx0XHRcdD8gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhbmdlc1dvcmtiZW5jaEJ1dHRvbkJhcldpZGdldCwgY29udGFpbmVyKVxuXHRcdFx0XHQ6IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYW5nZXNNZW51V29ya2JlbmNoQnV0dG9uQmFyV2lkZ2V0LCBjb250YWluZXIsIGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3NPYnMpO1xuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZCh3aWRnZXQpO1xuXHRcdFx0Y3VycmVudFdpZGdldCA9IHdpZGdldDtcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQod2lkZ2V0Lm9uRGlkQ2hhbmdlQWN0aW9ucygoKSA9PiB1cGRhdGVWaXNpYmlsaXR5KCkpKTtcblx0XHRcdHVwZGF0ZVZpc2liaWxpdHkoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik/LnN0YXR1cy5yZWFkKHJlYWRlcik7XG5cdFx0XHR1cGRhdGVWaXNpYmlsaXR5KCk7XG5cdFx0fSkpO1xuXHR9XG5cbn1cblxuLy8gLS0tIEVkaXRvciBoZWFkZXIgbWVudXMgKHNpbmdsZS1wYW5lKTogdGhlIENoYW5nZXMgZWRpdG9yIGRlY2xhcmVzXG4vLyBNZW51cy5TZXNzaW9uc0VkaXRvckhlYWRlclByaW1hcnkgKEJyYW5jaCBDaGFuZ2VzIHBpY2tlciArIGRpZmYgc3RhdHMgKyBjb2RlIHJldmlldyxcbi8vIGxlZnQpIGFuZCBNZW51cy5TZXNzaW9uc0VkaXRvckhlYWRlclNlY29uZGFyeSAoZGlmZi92aWV3LW1vZGUgYWN0aW9ucywgcmlnaHQpLCBhbmRcbi8vIHRoZSBlZGl0b3IgZ3JvdXAgcmVuZGVycyB0aGVtLiBUaGUgQ3JlYXRlIFB1bGwgUmVxdWVzdCBiYXIgKENoYW5nZXNBY3Rpb25zQmFyKSBpc1xuLy8gaG9zdGVkIGluIHRoZSBlZGl0b3IgdGFicyB0aXRsZSAoTWVudXMuU2Vzc2lvbnNFZGl0b3JUaXRsZSk7IGl0cyBjdXN0b20gYWN0aW9uIHZpZXdcbi8vIGl0ZW0gaXMgcHJvdmlkZWQgYnkgdGhlIENoYW5nZXMgZWRpdG9yIHBhbmUgKFNlc3Npb25DaGFuZ2VzRWRpdG9yLmdldEFjdGlvblZpZXdJdGVtKS5cbi8vIFRoZSBjdXN0b20gYWN0aW9uIHZpZXcgaXRlbXMgYmVsb3cgYXJlIHJlZ2lzdGVyZWQgZ2xvYmFsbHkgYnkgbWVudSBpZCBzbyB0aGVcbi8vIGhlYWRlciB0b29sYmFycyByZW5kZXIgdGhlbS5cblxuZXhwb3J0IGNvbnN0IENIQU5HRVNfSEVBREVSX0FDVElPTlNfSUQgPSAnd29ya2JlbmNoLmNoYW5nZXNWaWV3LmhlYWRlckFjdGlvbnMnO1xuXG4vKiogUmVuZGVycyB0aGUge0BsaW5rIENoYW5nZXNBY3Rpb25zQmFyfSB3aWRnZXQgYXMgdGhlIENyZWF0ZSBQdWxsIFJlcXVlc3QgZWRpdG9yIHRhYnMgdGl0bGUgYWN0aW9uIGl0ZW0uICovXG5leHBvcnQgY2xhc3MgQ2hhbmdlc0FjdGlvbnNCYXJBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhbmdlc0FjdGlvbnNCYXIsIGNvbnRhaW5lcikpO1xuXHR9XG59XG5cbi8qKiBSZWdpc3RlcnMgdGhlIENoYW5nZXMgZWRpdG9yLWhlYWRlciBhY3Rpb24gdmlldyBpdGVtcyBrZXllZCBieSB0aGUgZWRpdG9yLWhlYWRlciBtZW51IGlkcy4gKi9cbmNsYXNzIENoYW5nZXNFZGl0b3JIZWFkZXJDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmNoYW5nZXNFZGl0b3JIZWFkZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIGFjdGlvblZpZXdJdGVtU2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IG9uRGlkUmVnaXN0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihNZW51cy5TZXNzaW9uc0VkaXRvckhlYWRlclByaW1hcnksIFZFUlNJT05TX1BJQ0tFUl9BQ1RJT05fSUQsIChhY3Rpb24sIF9vcHRpb25zLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhbmdlc1BpY2tlckFjdGlvbkl0ZW0sIGFjdGlvbik7XG5cdFx0fSwgb25EaWRSZWdpc3Rlci5ldmVudCkpO1xuXG5cdFx0Ly8gQWx3YXlzIHJlbmRlcmVkLCB3aGV0aGVyIHRoZSBlZGl0b3IgYXJlYSBpcyB2aXNpYmxlIG9yIGNvbGxhcHNlZDogdGhlIHNhbWVcblx0XHQvLyBkaWZmLXN0YXRzIGFjdGlvbiBhcyB0aGUgY2xhc3NpYyBDaGFuZ2VzIHZpZXcgaGVhZGVyIChjbGlja2luZyBpdCBvcGVucyB0aGVcblx0XHQvLyBDaGFuZ2VzIGVkaXRvciksIGJ1dCB3aXRoIHRoZSByaWNoZXIgXCJOIGZpbGVzICtYIC1ZXCIgcmVuZGVyaW5nLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihNZW51cy5TZXNzaW9uc0VkaXRvckhlYWRlclByaW1hcnksIERJRkZfU1RBVFNfQUNUSU9OX0lELCAoYWN0aW9uLCBvcHRpb25zLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2luZ2xlUGFuZUNoYW5nZXNEaWZmU3RhdHNBY3Rpb25JdGVtLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdH0sIG9uRGlkUmVnaXN0ZXIuZXZlbnQpKTtcblxuXHRcdG9uRGlkUmVnaXN0ZXIuZmlyZSgpO1xuXHR9XG59XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhbmdlc0VkaXRvckhlYWRlckNvbnRyaWJ1dGlvbi5JRCwgQ2hhbmdlc0VkaXRvckhlYWRlckNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcblxuLy8gLS0tIFZpZXcgUGFuZVxuXG5leHBvcnQgY2xhc3MgQ2hhbmdlc1ZpZXdQYW5lIGV4dGVuZHMgVmlld1BhbmUge1xuXG5cdHByaXZhdGUgYm9keUNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgd2VsY29tZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZmlsZXNIZWFkZXJOb2RlOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBmaWxlSGVhZGVyVG9vbGJhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29udGVudENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbGlzdENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdC8vIEFjdGlvbnMgY29udGFpbmVyIGlzIHBvc2l0aW9uZWQgb3V0c2lkZSB0aGUgY2FyZCBmb3IgdGhpcyBsYXlvdXQgZXhwZXJpbWVudFxuXHRwcml2YXRlIGFjdGlvbnNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgY2hhbmdlc1Byb2dyZXNzQmFyITogUHJvZ3Jlc3NCYXI7XG5cdHByaXZhdGUgdHJlZTogV29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZTxDaGFuZ2VzVHJlZUVsZW1lbnQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNpU3RhdHVzV2lkZ2V0OiBDSVN0YXR1c1dpZGdldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzZXNzaW9uRmlsZXNXaWRnZXQ6IFNlc3Npb25GaWxlc1dpZGdldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzcGxpdFZpZXc6IFNwbGl0VmlldyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzcGxpdFZpZXdDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRyZWVQYW5lU2l6ZUNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPG51bWJlciB8IHVuZGVmaW5lZD4oKSk7XG5cblx0LyoqIENvbXB1dGVzIHRoZSBDSSBwYW5lJ3MgZGVmYXVsdCBoZWlnaHQgKGNvbnRlbnQsIGNhcHBlZCB0byBhIHRoaXJkIG9mIHRoZSBzcGxpdCkuICovXG5cdHByaXZhdGUgY29tcHV0ZUNJUHJlZmVycmVkSGVpZ2h0OiAoKCkgPT4gbnVtYmVyKSB8IHVuZGVmaW5lZDtcblx0LyoqIE9uY2UgdGhlIHVzZXIgZHJhZ3MgYSBzYXNoIHdlIHN0b3AgaW1wb3NpbmcgdGhlIENJIHBhbmUncyBkZWZhdWx0IGhlaWdodC4gKi9cblx0cHJpdmF0ZSBjaVBhbmVVc2VyUmVzaXplZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaXNNZXJnZUJhc2VCcmFuY2hQcm90ZWN0ZWRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBpc29sYXRpb25Nb2RlQ29udGV4dEtleTogSUNvbnRleHRLZXk8SXNvbGF0aW9uTW9kZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzR2l0UmVwb3NpdG9yeUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGhhc1Vwc3RyZWFtQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzSW5jb21pbmdDaGFuZ2VzQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzT3V0Z29pbmdDaGFuZ2VzQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzVW5jb21taXR0ZWRDaGFuZ2VzQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzQnJhbmNoQ2hhbmdlc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGhhc0dpdEh1YlJlbW90ZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGhhc1B1bGxSZXF1ZXN0Q29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzT3BlblB1bGxSZXF1ZXN0Q29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc09iczogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHQvLyBUcmFjayBjdXJyZW50IGJvZHkgZGltZW5zaW9ucyBmb3IgbGlzdCBsYXlvdXRcblx0cHJpdmF0ZSBjdXJyZW50Qm9keUhlaWdodCA9IDA7XG5cdHByaXZhdGUgY3VycmVudEJvZHlXaWR0aCA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdQYW5lT3B0aW9ucyxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNoYW5nZXNWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYW5nZXNWaWV3U2VydmljZTogSUNoYW5nZXNWaWV3U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVNlc3Npb25DaGFuZ2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25DaGFuZ2VzU2VydmljZTogSVNlc3Npb25DaGFuZ2VzU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JrYmVuY2hMYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoeyAuLi5vcHRpb25zLCB0aXRsZU1lbnVJZDogTWVudUlkLkNoYXRFZGl0aW5nU2Vzc2lvblRpdGxlVG9vbGJhciB9LCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblxuXHRcdC8vIENvbnRleHQga2V5c1xuXHRcdHRoaXMuaXNNZXJnZUJhc2VCcmFuY2hQcm90ZWN0ZWRDb250ZXh0S2V5ID0gQWN0aXZlU2Vzc2lvbkNvbnRleHRLZXlzLklzTWVyZ2VCYXNlQnJhbmNoUHJvdGVjdGVkLmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmlzb2xhdGlvbk1vZGVDb250ZXh0S2V5ID0gQWN0aXZlU2Vzc2lvbkNvbnRleHRLZXlzLklzb2xhdGlvbk1vZGUuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzR2l0UmVwb3NpdG9yeUNvbnRleHRLZXkgPSBBY3RpdmVTZXNzaW9uQ29udGV4dEtleXMuSGFzR2l0UmVwb3NpdG9yeS5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5oYXNVcHN0cmVhbUNvbnRleHRLZXkgPSBBY3RpdmVTZXNzaW9uQ29udGV4dEtleXMuSGFzVXBzdHJlYW0uYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzSW5jb21pbmdDaGFuZ2VzQ29udGV4dEtleSA9IEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cy5IYXNJbmNvbWluZ0NoYW5nZXMuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzT3V0Z29pbmdDaGFuZ2VzQ29udGV4dEtleSA9IEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cy5IYXNPdXRnb2luZ0NoYW5nZXMuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzVW5jb21taXR0ZWRDaGFuZ2VzQ29udGV4dEtleSA9IEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cy5IYXNVbmNvbW1pdHRlZENoYW5nZXMuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzQnJhbmNoQ2hhbmdlc0NvbnRleHRLZXkgPSBBY3RpdmVTZXNzaW9uQ29udGV4dEtleXMuSGFzQnJhbmNoQ2hhbmdlcy5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5oYXNHaXRIdWJSZW1vdGVDb250ZXh0S2V5ID0gQWN0aXZlU2Vzc2lvbkNvbnRleHRLZXlzLkhhc0dpdEh1YlJlbW90ZS5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5oYXNQdWxsUmVxdWVzdENvbnRleHRLZXkgPSBBY3RpdmVTZXNzaW9uQ29udGV4dEtleXMuSGFzUHVsbFJlcXVlc3QuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzT3BlblB1bGxSZXF1ZXN0Q29udGV4dEtleSA9IEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cy5IYXNPcGVuUHVsbFJlcXVlc3QuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc0NvbnRleHRLZXkgPSBBY3RpdmVTZXNzaW9uQ29udGV4dEtleXMuSGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzcy5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHQvLyBWZXJzaW9uIG1vZGVcblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShDaGFuZ2VzQ29udGV4dEtleXMuVmVyc2lvbk1vZGUsIHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIHJlYWRlciA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9icy5yZWFkKHJlYWRlcik/LmlkID8/ICcnO1xuXHRcdH0pKTtcblxuXHRcdC8vIFZpZXcgbW9kZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KENoYW5nZXNDb250ZXh0S2V5cy5WaWV3TW9kZSwgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSwgcmVhZGVyID0+IHtcblx0XHRcdHJldHVybiB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS52aWV3TW9kZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2V0IGNoYXRTZXNzaW9uVHlwZSBvbiB0aGUgdmlldydzIGNvbnRleHQga2V5IHNlcnZpY2Ugc28gVmlld1RpdGxlIG1lbnUgaXRlbXNcblx0XHQvLyBjYW4gdXNlIGl0IGluIHRoZWlyIGB3aGVuYCBjbGF1c2VzLiBVcGRhdGUgcmVhY3RpdmVseSB3aGVuIHRoZSBhY3RpdmUgc2Vzc2lvblxuXHRcdC8vIGNoYW5nZXMuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmluZENvbnRleHRLZXkoQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblR5cGUsIHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIHJlYWRlciA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvblR5cGVPYnMucmVhZChyZWFkZXIpID8/ICcnO1xuXHRcdH0pKTtcblxuXHRcdC8vIEdpdCBvcGVyYXRpb24gaW4gcHJvZ3Jlc3Mgc2V0IGluIHRoZSBnbG9iYWwgY29udGV4dCBrZXkgc2VydmljZSBieSB0aGUgZXh0ZW5zaW9uXG5cdFx0Y29uc3QgaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc0dsb2JhbENvbnRleHRPYnMgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0LCAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoJ3Nlc3Npb25zLmhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3MnKSA9PT0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdC8vIEdpdCBvcGVyYXRpb24gaW4gcHJvZ3Jlc3Mgc2V0IGluIHRoZSBzZXNzaW9uIHN0YXRlXG5cdFx0Y29uc3QgaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc1N0YXRlT2JzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvblN0YXRlID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvblN0YXRlT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBhY3RpdmVTZXNzaW9uU3RhdGU/Lmhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3MgPT09IHRydWU7XG5cdFx0fSk7XG5cblx0XHR0aGlzLmhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3NPYnMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzR2xvYmFsQ29udGV4dCA9IGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3NHbG9iYWxDb250ZXh0T2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3NTdGF0ZSA9IGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3NTdGF0ZU9icy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdC8vIFRoZSBnbG9iYWwgY29udGV4dCBrZXkgc2VydmljZSBpcyBiZWluZyBzZXQgYXMgc29vbiBhcyB0aGUgY29tbWFuZCBzdGFydHNcblx0XHRcdC8vIHNvIHdlIG5lZWQgdG8gcHJlZmVyIGl0IGZpcnN0IGJlZm9yZSBmYWxsaW5nIGJhY2sgdG8gdGhlIHNlc3Npb24gc3RhdGUuXG5cdFx0XHRjb25zdCBjb250ZXh0S2V5VmFsdWUgPSBoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzR2xvYmFsQ29udGV4dCA9PT0gdHJ1ZVxuXHRcdFx0XHQ/IGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3NHbG9iYWxDb250ZXh0XG5cdFx0XHRcdDogaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc1N0YXRlO1xuXG5cdFx0XHQvLyBQcm9wYWdhdGUgZ2xvYmFsIGNvbnRleHQgc2VydmljZSB2YWx1ZSB0byB0aGUgc2NvcGVkIGNvbnRleHQga2V5IHNlcnZpY2Vcblx0XHRcdC8vIGFzIHRoZSBzY29wZWQgY29udGV4dCBrZXkgc2VydmljZSBpcyB3aGF0IGl0IGlzIGJlaW5nIHVzZWQgaW4gdGhlIHZpZXdcblx0XHRcdHRoaXMuaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc0NvbnRleHRLZXkuc2V0KGNvbnRleHRLZXlWYWx1ZSk7XG5cblx0XHRcdHJldHVybiBjb250ZXh0S2V5VmFsdWU7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzY29wZWRTZXJ2aWNlQ29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSk7XG5cdFx0dGhpcy5zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQoc2NvcGVkU2VydmljZUNvbGxlY3Rpb24pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuYm9keUNvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcuY2hhbmdlcy12aWV3LWJvZHknKSk7XG5cblx0XHQvLyBBY3Rpb25zIGNvbnRhaW5lciAtIHBvc2l0aW9uZWQgb3V0c2lkZSBhbmQgYWJvdmUgdGhlIGNhcmRcblx0XHR0aGlzLmFjdGlvbnNDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuYm9keUNvbnRhaW5lciwgJCgnLmNoYXQtZWRpdGluZy1zZXNzaW9uLWFjdGlvbnMub3V0c2lkZS1jYXJkJykpO1xuXG5cdFx0Ly8gU3BsaXRWaWV3IGNvbnRhaW5lciBmb3IgcmVzaXphYmxlIGZpbGUgdHJlZSAvIENJIGNoZWNrcyBzcGxpdFxuXHRcdHRoaXMuc3BsaXRWaWV3Q29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLmJvZHlDb250YWluZXIsICQoJy5jaGFuZ2VzLXNwbGl0dmlldy1jb250YWluZXInKSk7XG5cblx0XHQvLyBNYWluIGNvbnRhaW5lciB3aXRoIGZpbGUgaWNvbnMgc3VwcG9ydCAodGhlIFwiY2FyZFwiKSBcdTIwMTQgdG9wIHBhbmVcblx0XHR0aGlzLmNvbnRlbnRDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuc3BsaXRWaWV3Q29udGFpbmVyLCAkKCcuY2hhdC1lZGl0aW5nLXNlc3Npb24tY29udGFpbmVyLnNob3ctZmlsZS1pY29ucycpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjcmVhdGVGaWxlSWNvblRoZW1hYmxlVHJlZUNvbnRhaW5lclNjb3BlKHRoaXMuY29udGVudENvbnRhaW5lciwgdGhpcy50aGVtZVNlcnZpY2UpKTtcblxuXHRcdC8vIFRvZ2dsZSBjbGFzcyBiYXNlZCBvbiB3aGV0aGVyIHRoZSBmaWxlIGljb24gdGhlbWUgaGFzIGZpbGUgaWNvbnNcblx0XHRjb25zdCB1cGRhdGVIYXNGaWxlSWNvbnMgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLmNvbnRlbnRDb250YWluZXIhLmNsYXNzTGlzdC50b2dnbGUoJ2hhcy1maWxlLWljb25zJywgdGhpcy50aGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZSgpLmhhc0ZpbGVJY29ucyk7XG5cdFx0fTtcblx0XHR1cGRhdGVIYXNGaWxlSWNvbnMoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZEZpbGVJY29uVGhlbWVDaGFuZ2UodXBkYXRlSGFzRmlsZUljb25zKSk7XG5cblx0XHQvLyBGaWxlcyBoZWFkZXIgKEJyYW5jaCBDaGFuZ2VzIGRyb3Bkb3duICsgZGlmZiBzdGF0cykuIEluIHRoZSBzaW5nbGUtcGFuZVxuXHRcdC8vIHJlZGVzaWduIHRoZXNlIGxpdmUgaW4gdGhlIGN1c3RvbSBDaGFuZ2VzIGVkaXRvciBpbnN0ZWFkLCBzbyB0aGUgcGFuZWxcblx0XHQvLyBvbWl0cyBpdHMgaGVhZGVyOyBvdGhlcndpc2UgKG9yaWdpbmFsIGxheW91dCkgdGhlIGhlYWRlciBpcyBzaG93biBoZXJlLlxuXHRcdHRoaXMuY3JlYXRlRmlsZXNIZWFkZXIodGhpcy5jb250ZW50Q29udGFpbmVyKTtcblxuXHRcdC8vIENoYW5nZXMgY2FyZCBwcm9ncmVzcyBiYXJcblx0XHRjb25zdCBwcm9ncmVzc0NvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5jb250ZW50Q29udGFpbmVyLCAkKCcuY2hhbmdlcy1wcm9ncmVzcycpKTtcblx0XHR0aGlzLmNoYW5nZXNQcm9ncmVzc0JhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQcm9ncmVzc0Jhcihwcm9ncmVzc0NvbnRhaW5lciwgZGVmYXVsdFByb2dyZXNzQmFyU3R5bGVzKSk7XG5cdFx0dGhpcy5jaGFuZ2VzUHJvZ3Jlc3NCYXIuc3RvcCgpLmhpZGUoKTtcblxuXHRcdC8vIExpc3QgY29udGFpbmVyXG5cdFx0dGhpcy5saXN0Q29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLmNvbnRlbnRDb250YWluZXIsICQoJy5jaGFuZ2VzLWZpbGUtbGlzdCcpKTtcblxuXHRcdC8vIFdlbGNvbWUgbWVzc2FnZSBmb3IgZW1wdHkgc3RhdGUgKGhpZGRlbiBieSBkZWZhdWx0LCBzaG93biB3aGVuIG5vIGNoYW5nZXMpXG5cdFx0dGhpcy53ZWxjb21lQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLmNvbnRlbnRDb250YWluZXIsICQoJy5jaGFuZ2VzLXdlbGNvbWUnKSk7XG5cdFx0dGhpcy53ZWxjb21lQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHRjb25zdCB3ZWxjb21lTWVzc2FnZSA9IGRvbS5hcHBlbmQodGhpcy53ZWxjb21lQ29udGFpbmVyLCAkKCcuY2hhbmdlcy13ZWxjb21lLW1lc3NhZ2UnKSk7XG5cdFx0d2VsY29tZU1lc3NhZ2UudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhbmdlc1ZpZXcubm9DaGFuZ2VzJywgXCJDaGFuZ2VkIGZpbGVzIGFuZCBvdGhlciBzZXNzaW9uIGFydGlmYWN0cyB3aWxsIGFwcGVhciBoZXJlLlwiKTtcblxuXHRcdC8vIE90aGVyIEZpbGVzIHdpZGdldCAtIG1pZGRsZSBwYW5lIChmaWxlcyBlZGl0ZWQgb3V0c2lkZSB0aGUgd29ya3NwYWNlKVxuXHRcdHRoaXMuc2Vzc2lvbkZpbGVzV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uRmlsZXNXaWRnZXQsIHRoaXMuc3BsaXRWaWV3Q29udGFpbmVyKSk7XG5cblx0XHQvLyBDSSBTdGF0dXMgd2lkZ2V0IFx1MjAxNCBib3R0b20gcGFuZVxuXHRcdHRoaXMuY2lTdGF0dXNXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENJU3RhdHVzV2lkZ2V0LCB0aGlzLnNwbGl0Vmlld0NvbnRhaW5lcikpO1xuXG5cdFx0Ly8gQ3JlYXRlIFNwbGl0Vmlld1xuXHRcdHRoaXMuc3BsaXRWaWV3ID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNwbGl0Vmlldyh0aGlzLnNwbGl0Vmlld0NvbnRhaW5lciwge1xuXHRcdFx0b3JpZW50YXRpb246IE9yaWVudGF0aW9uLlZFUlRJQ0FMLFxuXHRcdFx0cHJvcG9ydGlvbmFsTGF5b3V0OiBmYWxzZSxcblx0XHR9KSk7XG5cblx0XHQvLyBTaGFyZWQgY29uc3RhbnRzIGZvciBwYW5lIHNpemluZ1xuXHRcdGNvbnN0IGNpTWluSGVpZ2h0ID0gQ0lTdGF0dXNXaWRnZXQuSEVBREVSX0hFSUdIVCArIENJU3RhdHVzV2lkZ2V0Lk1JTl9CT0RZX0hFSUdIVDtcblx0XHRjb25zdCBzZXNzaW9uRmlsZXNNaW5IZWlnaHQgPSBTZXNzaW9uRmlsZXNXaWRnZXQuSEVBREVSX0hFSUdIVCArIFNlc3Npb25GaWxlc1dpZGdldC5NSU5fQk9EWV9IRUlHSFQ7XG5cdFx0Y29uc3QgZ2V0U2Vzc2lvbkZpbGVzQ29udGVudEhlaWdodCA9ICgpID0+IE1hdGgubWF4KFNlc3Npb25GaWxlc1dpZGdldC5IRUFERVJfSEVJR0hULCB0aGlzLnNlc3Npb25GaWxlc1dpZGdldD8uZGVzaXJlZEhlaWdodCA/PyAwKTtcblx0XHRjb25zdCBnZXRTZXNzaW9uRmlsZXNNaW5pbXVtSGVpZ2h0ID0gKCkgPT4gdGhpcy5zZXNzaW9uRmlsZXNXaWRnZXQ/LmNvbGxhcHNlZCA/IFNlc3Npb25GaWxlc1dpZGdldC5IRUFERVJfSEVJR0hUIDogTWF0aC5taW4oc2Vzc2lvbkZpbGVzTWluSGVpZ2h0LCBnZXRTZXNzaW9uRmlsZXNDb250ZW50SGVpZ2h0KCkpO1xuXHRcdGNvbnN0IGdldFNlc3Npb25GaWxlc1ByZWZlcnJlZEhlaWdodCA9ICgpID0+IE1hdGgubWF4KGdldFNlc3Npb25GaWxlc01pbmltdW1IZWlnaHQoKSwgU2Vzc2lvbkZpbGVzV2lkZ2V0LkhFQURFUl9IRUlHSFQgKyBTZXNzaW9uRmlsZXNXaWRnZXQuUFJFRkVSUkVEX0JPRFlfSEVJR0hUKTtcblx0XHRjb25zdCBnZXRDSUNvbnRlbnRIZWlnaHQgPSAoKSA9PiBNYXRoLm1heChDSVN0YXR1c1dpZGdldC5IRUFERVJfSEVJR0hULCB0aGlzLmNpU3RhdHVzV2lkZ2V0Py5kZXNpcmVkSGVpZ2h0ID8/IDApO1xuXHRcdGNvbnN0IGdldENJTWluaW11bUhlaWdodCA9ICgpID0+IHRoaXMuY2lTdGF0dXNXaWRnZXQ/LmNvbGxhcHNlZCA/IENJU3RhdHVzV2lkZ2V0LkhFQURFUl9IRUlHSFQgOiBNYXRoLm1pbihjaU1pbkhlaWdodCwgZ2V0Q0lDb250ZW50SGVpZ2h0KCkpO1xuXHRcdC8vIFByZWZlcnJlZCBkZWZhdWx0IHNpemUgZm9yIHRoZSBDSSBwYW5lOiBjb250ZW50IGhlaWdodCwgY2FwcGVkIHRvIGEgdGhpcmQgb2YgdGhlIHNwbGl0LlxuXHRcdGNvbnN0IGdldENJUHJlZmVycmVkSGVpZ2h0ID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudEhlaWdodCA9IGdldENJQ29udGVudEhlaWdodCgpO1xuXHRcdFx0aWYgKHRoaXMuY2lTdGF0dXNXaWRnZXQ/LmNvbGxhcHNlZCkge1xuXHRcdFx0XHRyZXR1cm4gQ0lTdGF0dXNXaWRnZXQuSEVBREVSX0hFSUdIVDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGF2YWlsYWJsZUhlaWdodCA9IHRoaXMuZ2V0U3BsaXRWaWV3QXZhaWxhYmxlSGVpZ2h0KCk7XG5cdFx0XHRpZiAoYXZhaWxhYmxlSGVpZ2h0ID4gMCkge1xuXHRcdFx0XHRyZXR1cm4gTWF0aC5tYXgoZ2V0Q0lNaW5pbXVtSGVpZ2h0KCksIE1hdGgubWluKGNvbnRlbnRIZWlnaHQsIE1hdGgucm91bmQoYXZhaWxhYmxlSGVpZ2h0IC8gMykpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjb250ZW50SGVpZ2h0O1xuXHRcdH07XG5cdFx0dGhpcy5jb21wdXRlQ0lQcmVmZXJyZWRIZWlnaHQgPSBnZXRDSVByZWZlcnJlZEhlaWdodDtcblx0XHRjb25zdCB0aGlzVmlldyA9IHRoaXM7XG5cblx0XHQvLyBUb3AgcGFuZTogZmlsZSB0cmVlXG5cdFx0Y29uc3QgdHJlZVBhbmU6IElWaWV3ID0ge1xuXHRcdFx0ZWxlbWVudDogdGhpcy5jb250ZW50Q29udGFpbmVyLFxuXHRcdFx0Z2V0IG1pbmltdW1TaXplKCkgeyByZXR1cm4gdGhpc1ZpZXcuZ2V0VHJlZVBhbmVNaW5pbXVtU2l6ZSgpOyB9LFxuXHRcdFx0Z2V0IG1heGltdW1TaXplKCkgeyByZXR1cm4gdGhpc1ZpZXcuZ2V0VHJlZVBhbmVNYXhpbXVtU2l6ZSgpOyB9LFxuXHRcdFx0b25EaWRDaGFuZ2U6IHRoaXMudHJlZVBhbmVTaXplQ2hhbmdlLmV2ZW50LFxuXHRcdFx0bGF5b3V0OiAoaGVpZ2h0KSA9PiB7XG5cdFx0XHRcdHRoaXMuY29udGVudENvbnRhaW5lciEuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0XHRcdFx0dGhpcy5fbGF5b3V0VHJlZUluUGFuZShoZWlnaHQpO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Ly8gTWlkZGxlIHBhbmU6IG90aGVyIGZpbGVzXG5cdFx0Y29uc3Qgc2Vzc2lvbkZpbGVzRWxlbWVudCA9IHRoaXMuc2Vzc2lvbkZpbGVzV2lkZ2V0LmVsZW1lbnQ7XG5cdFx0Y29uc3Qgc2Vzc2lvbkZpbGVzV2lkZ2V0ID0gdGhpcy5zZXNzaW9uRmlsZXNXaWRnZXQ7XG5cdFx0Y29uc3Qgc2Vzc2lvbkZpbGVzUGFuZTogSVZpZXcgPSB7XG5cdFx0XHRlbGVtZW50OiBzZXNzaW9uRmlsZXNFbGVtZW50LFxuXHRcdFx0Z2V0IG1pbmltdW1TaXplKCkgeyByZXR1cm4gZ2V0U2Vzc2lvbkZpbGVzTWluaW11bUhlaWdodCgpOyB9LFxuXHRcdFx0Z2V0IG1heGltdW1TaXplKCkgeyByZXR1cm4gc2Vzc2lvbkZpbGVzV2lkZ2V0LmNvbGxhcHNlZCA/IFNlc3Npb25GaWxlc1dpZGdldC5IRUFERVJfSEVJR0hUIDogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZOyB9LFxuXHRcdFx0cHJpb3JpdHk6IExheW91dFByaW9yaXR5LkhpZ2gsXG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQubWFwKHRoaXMuc2Vzc2lvbkZpbGVzV2lkZ2V0Lm9uRGlkQ2hhbmdlSGVpZ2h0LCAoKSA9PiB1bmRlZmluZWQpLFxuXHRcdFx0bGF5b3V0OiAoaGVpZ2h0KSA9PiB7XG5cdFx0XHRcdHNlc3Npb25GaWxlc0VsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0XHRcdFx0Y29uc3QgYm9keUhlaWdodCA9IE1hdGgubWF4KDAsIGhlaWdodCAtIFNlc3Npb25GaWxlc1dpZGdldC5IRUFERVJfSEVJR0hUKTtcblx0XHRcdFx0c2Vzc2lvbkZpbGVzV2lkZ2V0LmxheW91dChib2R5SGVpZ2h0KTtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdC8vIEJvdHRvbSBwYW5lOiBDSSBjaGVja3Ncblx0XHRjb25zdCBjaUVsZW1lbnQgPSB0aGlzLmNpU3RhdHVzV2lkZ2V0LmVsZW1lbnQ7XG5cdFx0Y29uc3QgY2lXaWRnZXQgPSB0aGlzLmNpU3RhdHVzV2lkZ2V0O1xuXHRcdGNvbnN0IGNpUGFuZTogSVZpZXcgPSB7XG5cdFx0XHRlbGVtZW50OiBjaUVsZW1lbnQsXG5cdFx0XHRnZXQgbWluaW11bVNpemUoKSB7IHJldHVybiBnZXRDSU1pbmltdW1IZWlnaHQoKTsgfSxcblx0XHRcdGdldCBtYXhpbXVtU2l6ZSgpIHsgcmV0dXJuIGNpV2lkZ2V0LmNvbGxhcHNlZCA/IENJU3RhdHVzV2lkZ2V0LkhFQURFUl9IRUlHSFQgOiBnZXRDSUNvbnRlbnRIZWlnaHQoKTsgfSxcblx0XHRcdHByaW9yaXR5OiBMYXlvdXRQcmlvcml0eS5Mb3csXG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQubWFwKHRoaXMuY2lTdGF0dXNXaWRnZXQub25EaWRDaGFuZ2VIZWlnaHQsICgpID0+IGdldENJQ29udGVudEhlaWdodCgpKSxcblx0XHRcdGxheW91dDogKGhlaWdodCkgPT4ge1xuXHRcdFx0XHRjaUVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0XHRcdFx0Y29uc3QgYm9keUhlaWdodCA9IE1hdGgubWF4KDAsIGhlaWdodCAtIENJU3RhdHVzV2lkZ2V0LkhFQURFUl9IRUlHSFQpO1xuXHRcdFx0XHRjaVdpZGdldC5sYXlvdXQoYm9keUhlaWdodCk7XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHR0aGlzLnNwbGl0Vmlldy5hZGRWaWV3KHRyZWVQYW5lLCBTaXppbmcuRGlzdHJpYnV0ZSwgMCwgdHJ1ZSk7XG5cdFx0dGhpcy5zcGxpdFZpZXcuYWRkVmlldyhzZXNzaW9uRmlsZXNQYW5lLCBTZXNzaW9uRmlsZXNXaWRnZXQuSEVBREVSX0hFSUdIVCArIFNlc3Npb25GaWxlc1dpZGdldC5QUkVGRVJSRURfQk9EWV9IRUlHSFQsIDEsIHRydWUpO1xuXHRcdHRoaXMuc3BsaXRWaWV3LmFkZFZpZXcoY2lQYW5lLCBDSVN0YXR1c1dpZGdldC5IRUFERVJfSEVJR0hUICsgQ0lTdGF0dXNXaWRnZXQuUFJFRkVSUkVEX0JPRFlfSEVJR0hULCAyLCB0cnVlKTtcblxuXHRcdC8vIFN0eWxlIHRoZSBzYXNoIGFzIGEgdmlzaWJsZSBzZXBhcmF0b3IgYmV0d2VlbiBzZWN0aW9uc1xuXHRcdGNvbnN0IHVwZGF0ZVNwbGl0Vmlld1N0eWxlcyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGJvcmRlckNvbG9yID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKFBBTkVMX1NFQ1RJT05fQk9SREVSKTtcblx0XHRcdHRoaXMuc3BsaXRWaWV3IS5zdHlsZSh7IHNlcGFyYXRvckJvcmRlcjogYm9yZGVyQ29sb3IgPz8gQ29sb3IudHJhbnNwYXJlbnQgfSk7XG5cdFx0fTtcblx0XHR1cGRhdGVTcGxpdFZpZXdTdHlsZXMoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UodXBkYXRlU3BsaXRWaWV3U3R5bGVzKSk7XG5cblx0XHQvLyBBIG1hbnVhbCBzYXNoIGRyYWcgaGFuZHMgbGF5b3V0IGNvbnRyb2wgdG8gdGhlIHVzZXI6IHN0b3AgaW1wb3NpbmcgdGhlIENJIGRlZmF1bHQgc2l6ZS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNwbGl0Vmlldy5vbkRpZFNhc2hDaGFuZ2UoKCkgPT4geyB0aGlzLmNpUGFuZVVzZXJSZXNpemVkID0gdHJ1ZTsgfSkpO1xuXG5cdFx0Ly8gSW5pdGlhbGx5IGhpZGUgdGhlIG90aGVyIGZpbGVzIGFuZCBDSSBwYW5lcyB1bnRpbCBjb250ZW50IGFycml2ZXNcblx0XHR0aGlzLnNwbGl0Vmlldy5zZXRWaWV3VmlzaWJsZSgxLCBmYWxzZSk7XG5cdFx0dGhpcy5zcGxpdFZpZXcuc2V0Vmlld1Zpc2libGUoMiwgZmFsc2UpO1xuXG5cdFx0Ly8gT3RoZXIgZmlsZXMgcGFuZSAoaW5kZXggMSlcblx0XHR0aGlzLl93aXJlU2VjdGlvblBhbmUodGhpcy5zZXNzaW9uRmlsZXNXaWRnZXQsIDEsIFNlc3Npb25GaWxlc1dpZGdldC5IRUFERVJfSEVJR0hULCBnZXRTZXNzaW9uRmlsZXNQcmVmZXJyZWRIZWlnaHQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2Vzc2lvbkZpbGVzV2lkZ2V0Lm9uRGlkQ2hhbmdlSGVpZ2h0KCgpID0+IHRoaXMuZmlyZVRyZWVQYW5lU2l6ZUNoYW5nZSgpKSk7XG5cblx0XHQvLyBDSSBjaGVja3MgcGFuZSAoaW5kZXggMilcblx0XHR0aGlzLl93aXJlU2VjdGlvblBhbmUodGhpcy5jaVN0YXR1c1dpZGdldCwgMiwgQ0lTdGF0dXNXaWRnZXQuSEVBREVSX0hFSUdIVCwgZ2V0Q0lQcmVmZXJyZWRIZWlnaHQsICgpID0+IHsgdGhpcy5jaVBhbmVVc2VyUmVzaXplZCA9IGZhbHNlOyB9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSh2aXNpYmxlID0+IHtcblx0XHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMub25WaXNpYmxlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVHJpZ2dlciBpbml0aWFsIHJlbmRlciBpZiBhbHJlYWR5IHZpc2libGVcblx0XHRpZiAodGhpcy5pc0JvZHlWaXNpYmxlKCkpIHtcblx0XHRcdHRoaXMub25WaXNpYmxlKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0QWN0aW9uc0NvbnRleHQoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvblJlc291cmNlT2JzLmdldCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblZpc2libGUoKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Ly8gVGl0bGUgYWN0aW9uc1xuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLnVwZGF0ZUFjdGlvbnMoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBMb2FkaW5nXG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaXNMb2FkaW5nID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldExvYWRpbmdPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGlzTG9hZGluZykge1xuXHRcdFx0XHR0aGlzLmNoYW5nZXNQcm9ncmVzc0Jhci5pbmZpbml0ZSgpLnNob3coMjAwKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuY2hhbmdlc1Byb2dyZXNzQmFyLnN0b3AoKS5oaWRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2hhbmdlc1xuXHRcdGNvbnN0IGNoYW5nZXNPYnMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjaGFuZ2VzID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIHRvSUNoYW5nZXNGaWxlSXRlbShjaGFuZ2VzKTtcblx0XHR9KTtcblxuXHRcdC8vIENoYW5nZXMgc3RhdGlzdGljc1xuXHRcdGNvbnN0IHRvcExldmVsU3RhdHMgPSBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZTx7IGZpbGVzOiBudW1iZXI7IGFkZGVkOiBudW1iZXI7IHJlbW92ZWQ6IG51bWJlciB9IHwgdW5kZWZpbmVkPih0aGlzLCAocmVhZGVyLCBsYXN0VmFsdWUpID0+IHtcblx0XHRcdGNvbnN0IGlzTG9hZGluZyA9IHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRMb2FkaW5nT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChpc0xvYWRpbmcpIHtcblx0XHRcdFx0cmV0dXJuIGxhc3RWYWx1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZW50cmllcyA9IGNoYW5nZXNPYnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRsZXQgYWRkZWQgPSAwLCByZW1vdmVkID0gMDtcblxuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRcdGFkZGVkICs9IGVudHJ5LmxpbmVzQWRkZWQ7XG5cdFx0XHRcdHJlbW92ZWQgKz0gZW50cnkubGluZXNSZW1vdmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyBmaWxlczogZW50cmllcy5sZW5ndGgsIGFkZGVkLCByZW1vdmVkIH07XG5cdFx0fSk7XG5cblx0XHQvLyBTZXR1cCBjb250ZXh0IGtleXMgYW5kIGFjdGlvbnMgdG9vbGJhclxuXHRcdGlmICh0aGlzLmFjdGlvbnNDb250YWluZXIpIHtcblx0XHRcdC8vIEJpbmQgY29udGV4dCBrZXlzXG5cdFx0XHR0aGlzLl9iaW5kQ29udGV4dEtleXModG9wTGV2ZWxTdGF0cyk7XG5cblx0XHRcdC8vIEluIHRoZSBzaW5nbGUtcGFuZSByZWRlc2lnbiB0aGUgQ3JlYXRlIFBSIGFjdGlvbnMgcmVuZGVyIGluIHRoZSBDaGFuZ2VzXG5cdFx0XHQvLyBlZGl0b3IgaGVhZGVyIGluc3RlYWQgb2YgdGhlIGRldGFpbCBwYW5lbC5cblx0XHRcdHRoaXMuY3JlYXRlQWN0aW9uc0J1dHRvbkJhcigpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25TdGF0dXNPYnMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gYWN0aXZlU2Vzc2lvbj8uc3RhdHVzLnJlYWQocmVhZGVyKTtcblx0XHR9KTtcblxuXHRcdC8vIFVwZGF0ZSB2aXNpYmlsaXR5IGJhc2VkIG9uIGVudHJpZXNcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRpZiAodGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkxvYWRpbmdPYnMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSGlkZSB0aGUgYWN0aW9ucyB0b29sYmFyIGZvciB1bnRpdGxlZCBzZXNzaW9ucy5cblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25TdGF0dXMgPSBhY3RpdmVTZXNzaW9uU3RhdHVzT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGlzVW50aXRsZWQgPSBhY3RpdmVTZXNzaW9uU3RhdHVzID09PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkO1xuXHRcdFx0aWYgKHRoaXMuYWN0aW9uc0NvbnRhaW5lcikge1xuXHRcdFx0XHRkb20uc2V0VmlzaWJpbGl0eSh0aGlzLmlzQWN0aW9uc0NvbnRhaW5lclZpc2libGUoaXNVbnRpdGxlZCksIHRoaXMuYWN0aW9uc0NvbnRhaW5lcik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXRzID0gdG9wTGV2ZWxTdGF0cy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBoYXNFbnRyaWVzID0gc3RhdHMgIT09IHVuZGVmaW5lZCAmJiBzdGF0cy5maWxlcyA+IDA7XG5cblx0XHRcdC8vIEZpbGVzIGhlYWRlciB2aXNpYmlsaXR5IChvcmlnaW5hbCBsYXlvdXQgb25seTsgYWJzZW50IGluIHNpbmdsZS1wYW5lIHJlZGVzaWduKS5cblx0XHRcdGlmICh0aGlzLmZpbGVzSGVhZGVyTm9kZSkge1xuXHRcdFx0XHRjb25zdCBoYXNHaXRSZXBvc2l0b3J5ID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkhhc0dpdFJlcG9zaXRvcnlPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRkb20uc2V0VmlzaWJpbGl0eSghaXNVbnRpdGxlZCAmJiAoaGFzR2l0UmVwb3NpdG9yeSB8fCBoYXNFbnRyaWVzKSwgdGhpcy5maWxlc0hlYWRlck5vZGUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuZmlsZUhlYWRlclRvb2xiYXJDb250YWluZXIpIHtcblx0XHRcdFx0ZG9tLnNldFZpc2liaWxpdHkoaGFzRW50cmllcywgdGhpcy5maWxlSGVhZGVyVG9vbGJhckNvbnRhaW5lcik7XG5cdFx0XHR9XG5cblx0XHRcdGRvbS5zZXRWaXNpYmlsaXR5KGhhc0VudHJpZXMsIHRoaXMubGlzdENvbnRhaW5lciEpO1xuXHRcdFx0ZG9tLnNldFZpc2liaWxpdHkoIWhhc0VudHJpZXMsIHRoaXMud2VsY29tZUNvbnRhaW5lciEpO1xuXG5cdFx0XHR0aGlzLmZpcmVUcmVlUGFuZVNpemVDaGFuZ2UoKTtcblx0XHRcdHRoaXMubGF5b3V0U3BsaXRWaWV3KCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRoZSB0cmVlXG5cdFx0aWYgKCF0aGlzLnRyZWUgJiYgdGhpcy5saXN0Q29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnRyZWUgPSB0aGlzLmNyZWF0ZUNoYW5nZXNUcmVlKHRoaXMubGlzdENvbnRhaW5lciwgdGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5LCB0aGlzLl9zdG9yZSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVnaXN0ZXIgdHJlZSBldmVudCBoYW5kbGVyc1xuXHRcdGlmICh0aGlzLnRyZWUpIHtcblx0XHRcdGNvbnN0IHRyZWUgPSB0aGlzLnRyZWU7XG5cblx0XHRcdC8vIFJlLWxheW91dCB3aGVuIHRyZWUgY29udGVudCBjaGFuZ2VzIHNvIHRoZSBjYXJkIGhlaWdodCBhZGp1c3RzXG5cdFx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZCh0cmVlLm9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZmlyZVRyZWVQYW5lU2l6ZUNoYW5nZSgpO1xuXHRcdFx0XHR0aGlzLmxheW91dFNwbGl0VmlldygpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZCh0cmVlLm9uRGlkT3BlbigoZSkgPT4ge1xuXHRcdFx0XHRpZiAoIWUuZWxlbWVudCB8fCAhaXNDaGFuZ2VzRmlsZUl0ZW0oZS5lbGVtZW50KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxvZ0NoYW5nZXNWaWV3RmlsZVNlbGVjdCh0aGlzLnRlbGVtZXRyeVNlcnZpY2UsIGUuZWxlbWVudC5jaGFuZ2VUeXBlKTtcblxuXHRcdFx0XHRpZiAodGhpcy5zaG91bGRPcGVuTW9kYWxEaWZmKCkpIHtcblx0XHRcdFx0XHRjb25zdCBpdGVtcyA9IGNoYW5nZXNPYnMuZ2V0KCk7XG5cdFx0XHRcdFx0dGhpcy5fb3BlbkZpbGVJdGVtKGUuZWxlbWVudCwgaXRlbXMsIGUuc2lkZUJ5U2lkZSwgISFlLmVkaXRvck9wdGlvbnM/LnByZXNlcnZlRm9jdXMsICEhZS5lZGl0b3JPcHRpb25zPy5waW5uZWQsIGl0ZW1zLmxlbmd0aCA+IDEpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEhvbGRpbmcgQWx0IGludmVydHMgdGhlIGNvbmZpZ3VyZWQgc2luZ2xlL211bHRpIGZpbGUgZGlmZiBiZWhhdmlvci5cblx0XHRcdFx0Y29uc3QgYWx0S2V5ID0gISEoZS5icm93c2VyRXZlbnQgYXMgTW91c2VFdmVudCB8IEtleWJvYXJkRXZlbnQgfCB1bmRlZmluZWQpPy5hbHRLZXk7XG5cdFx0XHRcdGNvbnN0IG9wZW5TaW5nbGVGaWxlRGlmZiA9IHRoaXMuc2hvdWxkT3BlblNpbmdsZUZpbGVEaWZmQnlEZWZhdWx0KCkgIT09IGFsdEtleTtcblx0XHRcdFx0aWYgKG9wZW5TaW5nbGVGaWxlRGlmZikge1xuXHRcdFx0XHRcdC8vIEFsdCBoZXJlIG9ubHkgc3dpdGNoZXMgdGhlIGRpZmYgbW9kZSwgbm90IHRoZSB0YXJnZXQgZ3JvdXAuXG5cdFx0XHRcdFx0Y29uc3Qgc2lkZUJ5U2lkZSA9IGUuc2lkZUJ5U2lkZSAmJiAhYWx0S2V5O1xuXHRcdFx0XHRcdHZvaWQgdGhpcy5fb3BlblNpbmdsZUZpbGVEaWZmRWRpdG9yKGUuZWxlbWVudCwgc2lkZUJ5U2lkZSwgISFlLmVkaXRvck9wdGlvbnM/LnByZXNlcnZlRm9jdXMsICEhZS5lZGl0b3JPcHRpb25zPy5waW5uZWQpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE9wZW4gbXVsdGktZmlsZSBkaWZmIGVkaXRvclxuXHRcdFx0XHR2b2lkIHRoaXMuX29wZW5NdWx0aUZpbGVEaWZmRWRpdG9yKGUuZWxlbWVudC51cmkpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrc1xuXHRcdGlmICh0aGlzLmNpU3RhdHVzV2lkZ2V0KSB7XG5cdFx0XHRjb25zdCBjaGVja3NWaWV3TW9kZWwgPSB0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoZWNrc1ZpZXdNb2RlbCk7XG5cdFx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChjaGVja3NWaWV3TW9kZWwpO1xuXG5cdFx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZCh0aGlzLmNpU3RhdHVzV2lkZ2V0LnNldElucHV0KGNoZWNrc1ZpZXdNb2RlbCkpO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyIGZpbGVzIChmaWxlcyBlZGl0ZWQgb3V0c2lkZSB0aGUgd29ya3NwYWNlIGR1cmluZyB0aGUgc2Vzc2lvbilcblx0XHRpZiAodGhpcy5zZXNzaW9uRmlsZXNXaWRnZXQpIHtcblx0XHRcdGNvbnN0IHNlc3Npb25GaWxlc1ZpZXdNb2RlbCA9IHRoaXMuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkZpbGVzVmlld01vZGVsKTtcblx0XHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHNlc3Npb25GaWxlc1ZpZXdNb2RlbCk7XG5cblx0XHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHRoaXMuc2Vzc2lvbkZpbGVzV2lkZ2V0LnNldElucHV0KHNlc3Npb25GaWxlc1ZpZXdNb2RlbCkpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB0cmVlIGRhdGEgd2l0aCBjb21iaW5lZCBlbnRyaWVzXG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY2hhbmdlcyA9IGNoYW5nZXNPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgdmlld01vZGUgPSB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS52aWV3TW9kZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBjaGFuZ2VzZXRMb2FkaW5nID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldExvYWRpbmdPYnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHQvLyBSZWFkIHNlc3Npb24gc3RhdGUgc28gdGhpcyBhdXRvcnVuIHJlLXJ1bnMgd2hlbiBnaXQgc3RhdGUgKGUuZy4gYnJhbmNoXG5cdFx0XHQvLyBuYW1lKSBhcnJpdmVzIGFzeW5jaHJvbm91c2x5LCBzaW5jZSB0aGUgdHJlZSByb290IGxhYmVsIGRlcGVuZHMgb24gaXQuXG5cdFx0XHR0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uU3RhdGVPYnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRpZiAoIXRoaXMudHJlZSB8fCBjaGFuZ2VzZXRMb2FkaW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVG9nZ2xlIGxpc3QtbW9kZSBjbGFzcyB0byByZW1vdmUgdHJlZSBpbmRlbnRhdGlvbiBpbiBsaXN0IG1vZGVcblx0XHRcdHRoaXMubGlzdENvbnRhaW5lcj8uY2xhc3NMaXN0LnRvZ2dsZSgnbGlzdC1tb2RlJywgdmlld01vZGUgPT09IENoYW5nZXNWaWV3TW9kZS5MaXN0KTtcblxuXHRcdFx0aWYgKHZpZXdNb2RlID09PSBDaGFuZ2VzVmlld01vZGUuVHJlZSkge1xuXHRcdFx0XHQvLyBUcmVlIG1vZGU6IGJ1aWxkIGhpZXJhcmNoaWNhbCB0cmVlIGZyb20gZmlsZSBlbnRyaWVzXG5cdFx0XHRcdGNvbnN0IHRyZWVSb290SW5mbyA9IHRoaXMuZ2V0VHJlZVJvb3RJbmZvKGNoYW5nZXMpO1xuXHRcdFx0XHRjb25zdCB0cmVlQ2hpbGRyZW4gPSBidWlsZFRyZWVDaGlsZHJlbihjaGFuZ2VzLCB0cmVlUm9vdEluZm8pO1xuXHRcdFx0XHR0aGlzLnRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgdHJlZUNoaWxkcmVuKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIExpc3QgbW9kZTogZmxhdCBsaXN0IG9mIGZpbGUgaXRlbXNcblx0XHRcdFx0Y29uc3QgbGlzdENoaWxkcmVuID0gY2hhbmdlcy5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0XHRcdGVsZW1lbnQ6IGl0ZW0sXG5cdFx0XHRcdFx0Y29sbGFwc2libGU6IGZhbHNlLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJT2JqZWN0VHJlZUVsZW1lbnQ8Q2hhbmdlc1RyZWVFbGVtZW50PikpO1xuXHRcdFx0XHR0aGlzLnRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgbGlzdENoaWxkcmVuKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5maXJlVHJlZVBhbmVTaXplQ2hhbmdlKCk7XG5cdFx0XHR0aGlzLmxheW91dFNwbGl0VmlldygpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2JpbmRDb250ZXh0S2V5cyh0b3BMZXZlbFN0YXRzOiBJT2JzZXJ2YWJsZTx7IGZpbGVzOiBudW1iZXIgfSB8IHVuZGVmaW5lZD4pOiB2b2lkIHtcblx0XHQvLyBSZXF1ZXN0IGluIHByb2dyZXNzIChjYW4gYmUgdXBkYXRlZCBpbmRlcGVuZGVudGx5IHNpbmNlIGl0IG9ubHkgYWZmZWN0cyBhY3Rpb24gZW5hYmxlbWVudCwgYW5kIG5vdCB2aXNpYmlsaXR5KVxuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKGJpbmRDb250ZXh0S2V5KENoYXRDb250ZXh0S2V5cy5yZXF1ZXN0SW5Qcm9ncmVzcywgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25TdGF0dXMgPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKT8uc3RhdHVzLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBhY3RpdmVTZXNzaW9uU3RhdHVzICE9PSBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCAmJiBhY3RpdmVTZXNzaW9uU3RhdHVzICE9PSBTZXNzaW9uU3RhdHVzLkVycm9yO1xuXHRcdH0pKTtcblxuXHRcdC8vIEhhcyBjaGFuZ2VzIChjYW4gYmUgdXBkYXRlZCBpbmRlcGVuZGVudGx5IHNpbmNlIGl0IG9ubHkgYWZmZWN0cyBhY3Rpb24gZW5hYmxlbWVudCwgYW5kIG5vdCB2aXNpYmlsaXR5KVxuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKGJpbmRDb250ZXh0S2V5KENoYXRDb250ZXh0S2V5cy5oYXNBZ2VudFNlc3Npb25DaGFuZ2VzLCB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdHMgPSB0b3BMZXZlbFN0YXRzLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBzdGF0cyAhPT0gdW5kZWZpbmVkICYmIHN0YXRzLmZpbGVzID4gMDtcblx0XHR9KSk7XG5cblx0XHQvLyBCdWxrIHVwZGF0ZSB0aGUgY29udGV4dCBrZXlzXG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uU3RhdGVPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFzdGF0ZSB8fCBzdGF0ZS5oYXNHaXRPcGVyYXRpb25JblByb2dyZXNzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFtDaGFuZ2VzVmlld1BhbmVdW19iaW5kQ29udGV4dEtleXNdIENvbnRleHQga2V5czogJHtKU09OLnN0cmluZ2lmeShzdGF0ZSl9YCk7XG5cblx0XHRcdHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKCgpID0+IHtcblx0XHRcdFx0dGhpcy5pc29sYXRpb25Nb2RlQ29udGV4dEtleS5zZXQoc3RhdGUuaXNvbGF0aW9uTW9kZSk7XG5cdFx0XHRcdHRoaXMuaGFzR2l0UmVwb3NpdG9yeUNvbnRleHRLZXkuc2V0KHN0YXRlLmhhc0dpdFJlcG9zaXRvcnkpO1xuXHRcdFx0XHR0aGlzLmlzTWVyZ2VCYXNlQnJhbmNoUHJvdGVjdGVkQ29udGV4dEtleS5zZXQoc3RhdGUuaXNNZXJnZUJhc2VCcmFuY2hQcm90ZWN0ZWQgPT09IHRydWUpO1xuXHRcdFx0XHR0aGlzLmhhc0dpdEh1YlJlbW90ZUNvbnRleHRLZXkuc2V0KHN0YXRlLmhhc0dpdEh1YlJlbW90ZSA9PT0gdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuaGFzUHVsbFJlcXVlc3RDb250ZXh0S2V5LnNldChzdGF0ZS5oYXNQdWxsUmVxdWVzdCA9PT0gdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuaGFzT3BlblB1bGxSZXF1ZXN0Q29udGV4dEtleS5zZXQoc3RhdGUuaGFzT3BlblB1bGxSZXF1ZXN0ID09PSB0cnVlKTtcblx0XHRcdFx0dGhpcy5oYXNVcHN0cmVhbUNvbnRleHRLZXkuc2V0KHN0YXRlLnVwc3RyZWFtQnJhbmNoTmFtZSAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5oYXNJbmNvbWluZ0NoYW5nZXNDb250ZXh0S2V5LnNldChzdGF0ZS5pbmNvbWluZ0NoYW5nZXMgIT09IHVuZGVmaW5lZCAmJiBzdGF0ZS5pbmNvbWluZ0NoYW5nZXMgPiAwKTtcblx0XHRcdFx0dGhpcy5oYXNPdXRnb2luZ0NoYW5nZXNDb250ZXh0S2V5LnNldChzdGF0ZS5vdXRnb2luZ0NoYW5nZXMgIT09IHVuZGVmaW5lZCAmJiBzdGF0ZS5vdXRnb2luZ0NoYW5nZXMgPiAwKTtcblx0XHRcdFx0dGhpcy5oYXNVbmNvbW1pdHRlZENoYW5nZXNDb250ZXh0S2V5LnNldChzdGF0ZS51bmNvbW1pdHRlZENoYW5nZXMgIT09IHVuZGVmaW5lZCAmJiBzdGF0ZS51bmNvbW1pdHRlZENoYW5nZXMgPiAwKTtcblx0XHRcdFx0dGhpcy5oYXNCcmFuY2hDaGFuZ2VzQ29udGV4dEtleS5zZXQoc3RhdGUuaGFzQnJhbmNoQ2hhbmdlcyA9PT0gdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc0NvbnRleHRLZXkuc2V0KHN0YXRlLmhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3MgPT09IHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqIExheW91dCB0aGUgdHJlZSB3aXRoaW4gaXRzIFNwbGl0VmlldyBwYW5lLiAqL1xuXHRwcml2YXRlIF9sYXlvdXRUcmVlSW5QYW5lKHBhbmVIZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy50cmVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU3VidHJhY3QgdGhlIGZpbGVzIGhlYWRlciBoZWlnaHQgKHByZXNlbnQgaW4gdGhlIG9yaWdpbmFsIGxheW91dCBvbmx5KS5cblx0XHRjb25zdCBmaWxlc0hlYWRlckhlaWdodCA9IHRoaXMuZmlsZXNIZWFkZXJOb2RlPy5vZmZzZXRIZWlnaHQgPz8gMDtcblx0XHRjb25zdCB0cmVlSGVpZ2h0ID0gTWF0aC5tYXgoMCwgcGFuZUhlaWdodCAtIGZpbGVzSGVhZGVySGVpZ2h0KTtcblx0XHR0aGlzLnRyZWUubGF5b3V0KHRyZWVIZWlnaHQsIHRoaXMuY3VycmVudEJvZHlXaWR0aCk7XG5cdFx0dGhpcy50cmVlLmdldEhUTUxFbGVtZW50KCkuc3R5bGUuaGVpZ2h0ID0gYCR7dHJlZUhlaWdodH1weGA7XG5cdH1cblxuXHRwcml2YXRlIGdldFRyZWVQYW5lTWluaW11bVNpemUoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5saXN0Q29udGFpbmVyPy5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZScpIHtcblx0XHRcdHJldHVybiBFTVBUWV9GSUxFX0NIQU5HRVNfTUlOX0hFSUdIVDtcblx0XHR9XG5cblx0XHQvLyBHcm93IHRoZSBtaW5pbXVtIHNpemUgdG8gZml0IHRoZSBmaWxlIGxpc3QgKGNhcHBlZCBhdCBUUkVFX1BBTkVfTUlOX1NJWkVfTUFYX1JPV1Mgcm93cykgcGx1cyBoZWFkZXIgY2hyb21lLlxuXHRcdGNvbnN0IGZpbGVzSGVhZGVySGVpZ2h0ID0gdGhpcy5maWxlc0hlYWRlck5vZGU/Lm9mZnNldEhlaWdodCA/PyAwO1xuXHRcdGNvbnN0IHRyZWVDb250ZW50SGVpZ2h0ID0gdGhpcy50cmVlPy5jb250ZW50SGVpZ2h0ID8/IDA7XG5cdFx0Y29uc3QgbWF4Um93c0hlaWdodCA9IFRSRUVfUEFORV9NSU5fU0laRV9NQVhfUk9XUyAqIENoYW5nZXNUcmVlRGVsZWdhdGUuUk9XX0hFSUdIVDtcblx0XHRjb25zdCBjYXBwZWRDb250ZW50SGVpZ2h0ID0gTWF0aC5taW4odHJlZUNvbnRlbnRIZWlnaHQsIG1heFJvd3NIZWlnaHQpO1xuXHRcdGNvbnN0IGJvdHRvbVBhZGRpbmcgPSB0cmVlQ29udGVudEhlaWdodCA8PSBtYXhSb3dzSGVpZ2h0ID8gVFJFRV9QQU5FX0xJU1RfQk9UVE9NX1BBRERJTkcgOiAwO1xuXG5cdFx0cmV0dXJuIE1hdGgubWF4KEVNUFRZX0ZJTEVfQ0hBTkdFU19NSU5fSEVJR0hULCBmaWxlc0hlYWRlckhlaWdodCArIGNhcHBlZENvbnRlbnRIZWlnaHQgKyBib3R0b21QYWRkaW5nKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VHJlZVBhbmVNYXhpbXVtU2l6ZSgpOiBudW1iZXIge1xuXHRcdGlmICghdGhpcy5zZXNzaW9uRmlsZXNXaWRnZXQ/LnZpc2libGUgfHwgdGhpcy5zZXNzaW9uRmlsZXNXaWRnZXQuY29sbGFwc2VkKSB7XG5cdFx0XHRyZXR1cm4gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbGVzSGVhZGVySGVpZ2h0ID0gdGhpcy5maWxlc0hlYWRlck5vZGU/Lm9mZnNldEhlaWdodCA/PyAwO1xuXHRcdGNvbnN0IHRyZWVDb250ZW50SGVpZ2h0ID0gdGhpcy5saXN0Q29udGFpbmVyPy5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZScgPyAwIDogdGhpcy50cmVlPy5jb250ZW50SGVpZ2h0ID8/IDA7XG5cdFx0Y29uc3QgYm90dG9tUGFkZGluZyA9IHRyZWVDb250ZW50SGVpZ2h0ID4gMCA/IFRSRUVfUEFORV9MSVNUX0JPVFRPTV9QQURESU5HIDogMDtcblx0XHRyZXR1cm4gTWF0aC5tYXgodGhpcy5nZXRUcmVlUGFuZU1pbmltdW1TaXplKCksIGZpbGVzSGVhZGVySGVpZ2h0ICsgdHJlZUNvbnRlbnRIZWlnaHQgKyBib3R0b21QYWRkaW5nKTtcblx0fVxuXG5cdHByaXZhdGUgZmlyZVRyZWVQYW5lU2l6ZUNoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWVQYW5lU2l6ZUNoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKiogQ29tcHV0ZSB0aGUgaGVpZ2h0IGF2YWlsYWJsZSB0byB0aGUgU3BsaXRWaWV3IHdpdGhpbiB0aGUgYm9keS4gKi9cblx0cHJpdmF0ZSBnZXRTcGxpdFZpZXdBdmFpbGFibGVIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRjb25zdCBib2R5SGVpZ2h0ID0gdGhpcy5jdXJyZW50Qm9keUhlaWdodDtcblx0XHRpZiAoYm9keUhlaWdodCA8PSAwKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0Y29uc3QgYm9keVBhZGRpbmcgPSAxNjsgLy8gOHB4IHRvcCArIDhweCBib3R0b20gZnJvbSAuY2hhbmdlcy12aWV3LWJvZHlcblx0XHRjb25zdCBhY3Rpb25zSGVpZ2h0ID0gdGhpcy5hY3Rpb25zQ29udGFpbmVyPy5vZmZzZXRIZWlnaHQgPz8gMDtcblx0XHRjb25zdCBhY3Rpb25zTWFyZ2luID0gYWN0aW9uc0hlaWdodCA+IDAgPyA4IDogMDtcblx0XHRyZXR1cm4gTWF0aC5tYXgoMCwgYm9keUhlaWdodCAtIGJvZHlQYWRkaW5nIC0gYWN0aW9uc0hlaWdodCAtIGFjdGlvbnNNYXJnaW4pO1xuXHR9XG5cblx0LyoqIExheW91dCB0aGUgU3BsaXRWaWV3IHRvIGZpbGwgYXZhaWxhYmxlIGJvZHkgc3BhY2UuICovXG5cdHByaXZhdGUgbGF5b3V0U3BsaXRWaWV3KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zcGxpdFZpZXcgfHwgIXRoaXMuc3BsaXRWaWV3Q29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGF2YWlsYWJsZUhlaWdodCA9IHRoaXMuZ2V0U3BsaXRWaWV3QXZhaWxhYmxlSGVpZ2h0KCk7XG5cdFx0aWYgKGF2YWlsYWJsZUhlaWdodCA8PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuc3BsaXRWaWV3Q29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2F2YWlsYWJsZUhlaWdodH1weGA7XG5cdFx0dGhpcy5zcGxpdFZpZXcubGF5b3V0KGF2YWlsYWJsZUhlaWdodCk7XG5cdFx0dGhpcy5hcHBseUNJRGVmYXVsdFNpemUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1hc3NlcnQgdGhlIENJIHBhbmUncyBkZWZhdWx0IGhlaWdodCAoY2FwcGVkIHRvIGEgdGhpcmQgb2YgdGhlIHNwbGl0KSBhZnRlciBsYXlvdXQuXG5cdCAqIFRoaXMgaXMgd2hlcmUgdGhlIHNwbGl0IGhlaWdodCBpcyByZWxpYWJseSBrbm93biBcdTIwMTQgdGhlIHByZWZlcnJlZCBoZWlnaHQgY2FuIG90aGVyd2lzZSBiZVxuXHQgKiBldmFsdWF0ZWQgZHVyaW5nIHdpcmluZyB3aGVuIHRoZSBib2R5IGhlaWdodCBpcyBzdGlsbCAwLCB5aWVsZGluZyBhbiB1bmNhcHBlZCBmYWxsYmFjay5cblx0ICogT25jZSB0aGUgdXNlciBkcmFncyBhIHNhc2ggd2UgYmFjayBvZmYgYW5kIHByZXNlcnZlIHRoZWlyIGNob3NlbiBzaXplLlxuXHQgKi9cblx0cHJpdmF0ZSBhcHBseUNJRGVmYXVsdFNpemUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnNwbGl0VmlldyB8fCB0aGlzLmNpUGFuZVVzZXJSZXNpemVkIHx8ICF0aGlzLmNvbXB1dGVDSVByZWZlcnJlZEhlaWdodCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuY2lTdGF0dXNXaWRnZXQ/LnZpc2libGUgfHwgdGhpcy5jaVN0YXR1c1dpZGdldC5jb2xsYXBzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcHJlZmVycmVkID0gdGhpcy5jb21wdXRlQ0lQcmVmZXJyZWRIZWlnaHQoKTtcblx0XHRpZiAodGhpcy5zcGxpdFZpZXcuZ2V0Vmlld1NpemUoMikgIT09IHByZWZlcnJlZCkge1xuXHRcdFx0dGhpcy5zcGxpdFZpZXcucmVzaXplVmlldygyLCBwcmVmZXJyZWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBXaXJlcyBhIGNvbGxhcHNpYmxlIHNlY3Rpb24gd2lkZ2V0IChDSSBjaGVja3MgLyBvdGhlciBmaWxlcykgdG8gaXRzXG5cdCAqIFNwbGl0VmlldyBwYW5lOiB0b2dnbGluZyBpdHMgaGVhZGVyIGNvbGxhcHNlcy9yZXN0b3JlcyB0aGUgcGFuZSwgYW5kXG5cdCAqIGNoYW5nZXMgdG8gaXRzIGNvbnRlbnQgc2hvdy9oaWRlIHRoZSBwYW5lIGFuZCByZS1sYXlvdXQuIEJvdGggc2VjdGlvblxuXHQgKiB3aWRnZXRzIHNoYXJlIHRoZSBzYW1lIHN0cnVjdHVyYWwgY29udHJhY3Qgc28gdGhpcyBsb2dpYyBpcyByZXVzZWQuXG5cdCAqL1xuXHRwcml2YXRlIF93aXJlU2VjdGlvblBhbmUoXG5cdFx0d2lkZ2V0OiB7IHJlYWRvbmx5IGNvbGxhcHNlZDogYm9vbGVhbjsgcmVhZG9ubHkgdmlzaWJsZTogYm9vbGVhbjsgcmVhZG9ubHkgb25EaWRUb2dnbGVDb2xsYXBzZWQ6IEV2ZW50PGJvb2xlYW4+OyByZWFkb25seSBvbkRpZENoYW5nZUhlaWdodDogRXZlbnQ8dm9pZD4gfSxcblx0XHRwYW5lSW5kZXg6IG51bWJlcixcblx0XHRoZWFkZXJIZWlnaHQ6IG51bWJlcixcblx0XHRnZXRQcmVmZXJyZWRIZWlnaHQ6ICgpID0+IG51bWJlcixcblx0XHRvbkRpZEJlY29tZVZpc2libGU/OiAoKSA9PiB2b2lkLFxuXHQpOiB2b2lkIHtcblx0XHRsZXQgc2F2ZWRQYW5lSGVpZ2h0ID0gZ2V0UHJlZmVycmVkSGVpZ2h0KCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3aWRnZXQub25EaWRUb2dnbGVDb2xsYXBzZWQoY29sbGFwc2VkID0+IHtcblx0XHRcdGlmICghdGhpcy5zcGxpdFZpZXcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbGxhcHNlZCkge1xuXHRcdFx0XHQvLyBTYXZlIGN1cnJlbnQgc2l6ZSBiZWZvcmUgY29sbGFwc2luZ1xuXHRcdFx0XHRjb25zdCBjdXJyZW50U2l6ZSA9IHRoaXMuc3BsaXRWaWV3LmdldFZpZXdTaXplKHBhbmVJbmRleCk7XG5cdFx0XHRcdGlmIChjdXJyZW50U2l6ZSA+IGhlYWRlckhlaWdodCkge1xuXHRcdFx0XHRcdHNhdmVkUGFuZUhlaWdodCA9IGN1cnJlbnRTaXplO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuc3BsaXRWaWV3LnJlc2l6ZVZpZXcocGFuZUluZGV4LCBoZWFkZXJIZWlnaHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gUmVzdG9yZSBzYXZlZCBzaXplIG9uIGV4cGFuZFxuXHRcdFx0XHR0aGlzLnNwbGl0Vmlldy5yZXNpemVWaWV3KHBhbmVJbmRleCwgc2F2ZWRQYW5lSGVpZ2h0KTtcblx0XHRcdH1cblx0XHRcdHRoaXMubGF5b3V0U3BsaXRWaWV3KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod2lkZ2V0Lm9uRGlkQ2hhbmdlSGVpZ2h0KCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5zcGxpdFZpZXcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdmlzaWJsZSA9IHdpZGdldC52aXNpYmxlO1xuXHRcdFx0Y29uc3QgaXNDdXJyZW50bHlWaXNpYmxlID0gdGhpcy5zcGxpdFZpZXcuaXNWaWV3VmlzaWJsZShwYW5lSW5kZXgpO1xuXHRcdFx0aWYgKHZpc2libGUgIT09IGlzQ3VycmVudGx5VmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLnNwbGl0Vmlldy5zZXRWaWV3VmlzaWJsZShwYW5lSW5kZXgsIHZpc2libGUpO1xuXHRcdFx0XHRpZiAodmlzaWJsZSAmJiAhd2lkZ2V0LmNvbGxhcHNlZCkge1xuXHRcdFx0XHRcdG9uRGlkQmVjb21lVmlzaWJsZT8uKCk7XG5cdFx0XHRcdFx0c2F2ZWRQYW5lSGVpZ2h0ID0gZ2V0UHJlZmVycmVkSGVpZ2h0KCk7XG5cdFx0XHRcdFx0dGhpcy5zcGxpdFZpZXcucmVzaXplVmlldyhwYW5lSW5kZXgsIHNhdmVkUGFuZUhlaWdodCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMubGF5b3V0U3BsaXRWaWV3KCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUcmVlU2VsZWN0aW9uKCk6IElDaGFuZ2VzRmlsZUl0ZW1bXSB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy50cmVlPy5nZXRTZWxlY3Rpb24oKSA/PyBbXTtcblx0XHRyZXR1cm4gc2VsZWN0aW9uLmZpbHRlcihpdGVtID0+ICEhaXRlbSAmJiBpc0NoYW5nZXNGaWxlSXRlbShpdGVtKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFRyZWVSb290SW5mbyhpdGVtczogcmVhZG9ubHkgSUNoYW5nZXNGaWxlSXRlbVtdKTogSUNoYW5nZXNUcmVlUm9vdEluZm8gfCB1bmRlZmluZWQge1xuXHRcdGlmIChpdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gR2V0IHRoZSByZXBvc2l0b3J5IGRldGFpbHMgZm9yIHRoZSBzZXNzaW9uXG5cdFx0Ly8gLSB1cmk6IGxvY2F0aW9uIG9mIHRoZSByZXBvc2l0b3J5XG5cdFx0Ly8gLSB3b3JraW5nRGlyZWN0b3J5OiBsb2NhdGlvbiBvZiB0aGUgd29ya3RyZWVcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRjb25zdCBmb2xkZXIgPSBhY3RpdmVTZXNzaW9uPy53b3Jrc3BhY2UuZ2V0KCk/LmZvbGRlcnNbMF07XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyVXJpID0gZm9sZGVyPy53b3JraW5nRGlyZWN0b3J5O1xuXHRcdGlmICghZm9sZGVyPy5yb290IHx8ICF3b3Jrc3BhY2VGb2xkZXJVcmkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IG5hbWU6IHN0cmluZyA9ICcnO1xuXHRcdGxldCByZXNvdXJjZVRyZWVSb290VXJpID0gd29ya3NwYWNlRm9sZGVyVXJpO1xuXG5cdFx0aWYgKHdvcmtzcGFjZUZvbGRlclVyaS5zY2hlbWUgPT09IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUpIHtcblx0XHRcdC8vIENsb3VkIHNlc3Npb25cblx0XHRcdHJlc291cmNlVHJlZVJvb3RVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5jb3BpbG90UHIsIHBhdGg6ICcvJyB9KTtcblx0XHRcdGNvbnN0IHNlZ21lbnRzID0gd29ya3NwYWNlRm9sZGVyVXJpLnBhdGguc3BsaXQoJy8nKS5maWx0ZXIoQm9vbGVhbik7XG5cdFx0XHRuYW1lID0gYCR7c2VnbWVudHMuc2xpY2UoMCwgMikuam9pbignLycpfSAoJHtkZWNvZGVVUklDb21wb25lbnQoc2VnbWVudHNbMl0pfSlgO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBMb2NhbCBzZXNzaW9uXG5cdFx0XHRjb25zdCBicmFuY2hOYW1lID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvblN0YXRlT2JzLmdldCgpPy5icmFuY2hOYW1lO1xuXHRcdFx0bmFtZSA9IGJyYW5jaE5hbWVcblx0XHRcdFx0PyBgJHtiYXNlbmFtZShmb2xkZXIud29ya2luZ0RpcmVjdG9yeSl9ICgke2JyYW5jaE5hbWV9KWBcblx0XHRcdFx0OiBiYXNlbmFtZShmb2xkZXIud29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJvb3Q6IHtcblx0XHRcdFx0dHlwZTogJ3Jvb3QnLFxuXHRcdFx0XHR1cmk6IHdvcmtzcGFjZUZvbGRlclVyaSxcblx0XHRcdFx0bmFtZVxuXHRcdFx0fSxcblx0XHRcdHJlc291cmNlVHJlZVJvb3RVcmlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXNzaW9uRGlzY2FyZFJlZigpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNoYW5nZXNldCA9IHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRPYnMuZ2V0KCk7XG5cdFx0cmV0dXJuIGNoYW5nZXNldD8ub3JpZ2luYWxDaGVja3BvaW50UmVmLmdldCgpID8/ICcnO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMuY3VycmVudEJvZHlIZWlnaHQgPSBoZWlnaHQ7XG5cdFx0dGhpcy5jdXJyZW50Qm9keVdpZHRoID0gd2lkdGg7XG5cdFx0dGhpcy5sYXlvdXRTcGxpdFZpZXcoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cblx0XHRpZiAodGhpcy50cmVlICYmIHRoaXMudHJlZS5nZXROb2RlKG51bGwpLnZpc2libGVDaGlsZHJlbkNvdW50ID4gMCkge1xuXHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTaWRlYmFyTGlzdChcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdG9uRGlkTGF5b3V0OiBFdmVudDx7IHJlYWRvbmx5IGhlaWdodDogbnVtYmVyOyByZWFkb25seSB3aWR0aDogbnVtYmVyIH0+LFxuXHRcdGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0aXRlbXM6IElDaGFuZ2VzRmlsZUl0ZW1bXSxcblx0XHRvcGVuRmlsZUl0ZW06IChpdGVtOiBJQ2hhbmdlc0ZpbGVJdGVtLCBpdGVtczogSUNoYW5nZXNGaWxlSXRlbVtdLCBzaWRlQnlTaWRlOiBib29sZWFuLCBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuLCBwaW5uZWQ6IGJvb2xlYW4sIGluY2x1ZGVTaWRlYmFyOiBib29sZWFuKSA9PiB2b2lkLFxuXHQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY2hhbmdlcy1maWxlLWxpc3QnKTtcblxuXHRcdGNvbnN0IHZpZXdNb2RlID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2Uudmlld01vZGVPYnMuZ2V0KCk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2xpc3QtbW9kZScsIHZpZXdNb2RlID09PSBDaGFuZ2VzVmlld01vZGUuTGlzdCk7XG5cblx0XHQvLyBcIkNoYW5nZXNcIiBoZWFkZXJcblx0XHRjb25zdCBoZWFkZXJOb2RlID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5jaGFuZ2VzLXNpZGViYXItaGVhZGVyJykpO1xuXHRcdGNvbnN0IGhlYWRlckxhYmVsID0gZG9tLmFwcGVuZChoZWFkZXJOb2RlLCAkKCdzcGFuJykpO1xuXHRcdGhlYWRlckxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYW5nZXMnLCBcIkNoYW5nZXNcIik7XG5cdFx0Y29uc3QgY291bnRCYWRnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ291bnRCYWRnZShoZWFkZXJOb2RlLCB7IGNvdW50OiBpdGVtcy5sZW5ndGggfSwgZGVmYXVsdENvdW50QmFkZ2VTdHlsZXMpKTtcblx0XHRjb3VudEJhZGdlLnNldENvdW50KGl0ZW1zLmxlbmd0aCk7XG5cblx0XHRjb25zdCB0cmVlID0gdGhpcy5jcmVhdGVDaGFuZ2VzVHJlZShjb250YWluZXIsIEV2ZW50Lk5vbmUsIGRpc3Bvc2FibGVzLCAoKSA9PiB0cmVlLmdldFNlbGVjdGlvbigpLmZpbHRlcihpdGVtID0+ICEhaXRlbSAmJiBpc0NoYW5nZXNGaWxlSXRlbShpdGVtKSksIGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGlmICh2aWV3TW9kZSA9PT0gQ2hhbmdlc1ZpZXdNb2RlLlRyZWUpIHtcblx0XHRcdHRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgYnVpbGRUcmVlQ2hpbGRyZW4oaXRlbXMsIHRoaXMuZ2V0VHJlZVJvb3RJbmZvKGl0ZW1zKSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0cmVlLnNldENoaWxkcmVuKG51bGwsIGl0ZW1zLm1hcChpdGVtID0+ICh7IGVsZW1lbnQ6IGl0ZW0gYXMgQ2hhbmdlc1RyZWVFbGVtZW50LCBjb2xsYXBzaWJsZTogZmFsc2UgfSkpKTtcblx0XHR9XG5cblx0XHQvLyBPcGVuIGZpbGUgb24gc2VsZWN0aW9uLiBUaGUgYHVwZGF0aW5nU2VsZWN0aW9uYCBndWFyZCByZWxpZXMgb25cblx0XHQvLyBgdHJlZS5zZXRGb2N1c2AvYHNldFNlbGVjdGlvbmAgZmlyaW5nIGV2ZW50cyBzeW5jaHJvbm91c2x5LlxuXHRcdGxldCB1cGRhdGluZ1NlbGVjdGlvbiA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0cmVlLm9uRGlkT3BlbihlID0+IHtcblx0XHRcdGlmIChlLmVsZW1lbnQgJiYgaXNDaGFuZ2VzRmlsZUl0ZW0oZS5lbGVtZW50KSAmJiAhdXBkYXRpbmdTZWxlY3Rpb24pIHtcblx0XHRcdFx0b3BlbkZpbGVJdGVtKGUuZWxlbWVudCwgaXRlbXMsIGUuc2lkZUJ5U2lkZSwgISFlLmVkaXRvck9wdGlvbnMucHJlc2VydmVGb2N1cywgISFlLmVkaXRvck9wdGlvbnMucGlubmVkLCBmYWxzZSAvKiBwcmVzZXJ2ZSBleGlzdGluZyBzaWRlYmFyICovKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBUcmFjayBhY3RpdmUgZWRpdG9yIGFuZCBoaWdobGlnaHQgaW4gc2lkZWJhclxuXHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5ydW5BbmRTdWJzY3JpYmUodGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRcdFx0aWYgKCFhY3RpdmVFZGl0b3IpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcmltYXJ5UmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaShhY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRcdGNvbnN0IHNlY29uZGFyeVJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoYWN0aXZlRWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlNFQ09OREFSWSB9KTtcblxuXHRcdFx0Y29uc3QgaW5kZXggPSBpdGVtcy5maW5kSW5kZXgoaSA9PlxuXHRcdFx0XHQocHJpbWFyeVJlc291cmNlICE9PSB1bmRlZmluZWQgJiYgaXNFcXVhbChpLnVyaSwgcHJpbWFyeVJlc291cmNlKSkgfHxcblx0XHRcdFx0KHNlY29uZGFyeVJlc291cmNlICE9PSB1bmRlZmluZWQgJiYgaS5vcmlnaW5hbFVyaSAhPT0gdW5kZWZpbmVkICYmIGlzRXF1YWwoaS5vcmlnaW5hbFVyaSwgc2Vjb25kYXJ5UmVzb3VyY2UpKVxuXHRcdFx0KTtcblx0XHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHRcdHVwZGF0aW5nU2VsZWN0aW9uID0gdHJ1ZTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR0cmVlLnNldEZvY3VzKFtpdGVtc1tpbmRleF1dKTtcblx0XHRcdFx0XHR0cmVlLnNldFNlbGVjdGlvbihbaXRlbXNbaW5kZXhdXSk7XG5cdFx0XHRcdFx0dHJlZS5yZXZlYWwoaXRlbXNbaW5kZXhdKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHR1cGRhdGluZ1NlbGVjdGlvbiA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTGF5b3V0IG9uIHJlc2l6ZSwgYWNjb3VudGluZyBmb3IgdGhlIGhlYWRlciBoZWlnaHRcblx0XHRkaXNwb3NhYmxlcy5hZGQob25EaWRMYXlvdXQoZSA9PiB7XG5cdFx0XHRjb25zdCBoZWFkZXJIZWlnaHQgPSBoZWFkZXJOb2RlLm9mZnNldEhlaWdodDtcblx0XHRcdHRyZWUubGF5b3V0KE1hdGgubWF4KDAsIGUuaGVpZ2h0IC0gaGVhZGVySGVpZ2h0KSwgZS53aWR0aCk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDaGFuZ2VzVHJlZShcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogRXZlbnQ8Ym9vbGVhbj4sXG5cdFx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0XHRnZXRTZWxlY3Rpb24/OiAoKSA9PiBJQ2hhbmdlc0ZpbGVJdGVtW10sXG5cdFx0Y29udGV4dEtleVNlcnZpY2U/OiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCk6IFdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWU8Q2hhbmdlc1RyZWVFbGVtZW50PiB7XG5cdFx0Ly8gV2hlbiBhIHNjb3BlZCBjb250ZXh0IGtleSBzZXJ2aWNlIGlzIHByb3ZpZGVkIChlLmcuIHdoZW4gcmVuZGVyaW5nIGludG9cblx0XHQvLyB0aGUgbW9kYWwgZWRpdG9yIHNpZGViYXIpLCBjcmVhdGUgdGhlIHRyZWUgd2l0aCBhbiBpbnN0YW50aWF0aW9uIHNlcnZpY2Vcblx0XHQvLyB0aGF0IHVzZXMgaXQgc28gdGhlIHRyZWUncyBjb250ZXh0IGRlc2NlbmRzIGZyb20gdGhlIG1vZGFsLiBUaGlzIGtlZXBzXG5cdFx0Ly8gbW9kYWwtbGV2ZWwgY29udGV4dCBrZXlzIChlLmcuIGBlZGl0b3JQYXJ0TW9kYWxgKSBhY3RpdmUgd2hpbGUgdGhlIHRyZWVcblx0XHQvLyBoYXMgZm9jdXMuXG5cdFx0Y29uc3QgdHJlZUluc3RhbnRpYXRpb25TZXJ2aWNlID0gY29udGV4dEtleVNlcnZpY2Vcblx0XHRcdD8gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlXSkpKVxuXHRcdFx0OiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VMYWJlbHMgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVscywgeyBvbkRpZENoYW5nZVZpc2liaWxpdHkgfSkpO1xuXHRcdGNvbnN0IGFjdGlvblJ1bm5lciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhbmdlc1ZpZXdBY3Rpb25SdW5uZXIoXG5cdFx0XHQoKSA9PiB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2VPYnMuZ2V0KCksXG5cdFx0XHQoKSA9PiB0aGlzLmdldFNlc3Npb25EaXNjYXJkUmVmKCksXG5cdFx0XHRnZXRTZWxlY3Rpb24gPz8gKCgpID0+IHRoaXMuZ2V0VHJlZVNlbGVjdGlvbigpKSxcblx0XHQpKTtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKHRyZWVJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWU8Q2hhbmdlc1RyZWVFbGVtZW50Pixcblx0XHRcdCdDaGFuZ2VzVmlld1RyZWUnLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0bmV3IENoYW5nZXNUcmVlRGVsZWdhdGUoKSxcblx0XHRcdFt0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYW5nZXNUcmVlUmVuZGVyZXIsIHJlc291cmNlTGFiZWxzLCBhY3Rpb25SdW5uZXIsXG5cdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHQvLyBQYXNzIGluIHRoZSB0cmVlIHJvb3QgdG8gYmUgdXNlZCB0byBjb21wdXRlIHRoZSBsYWJlbCBkZXNjcmlwdGlvblxuXHRcdFx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdFx0XHRcdGNvbnN0IGZvbGRlciA9IGFjdGl2ZVNlc3Npb24/LndvcmtzcGFjZS5nZXQoKT8uZm9sZGVyc1swXTtcblx0XHRcdFx0XHRyZXR1cm4gZm9sZGVyPy5yb290LnNjaGVtZSA9PT0gR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRVxuXHRcdFx0XHRcdFx0PyBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5jb3BpbG90UHIsIHBhdGg6ICcvJyB9KVxuXHRcdFx0XHRcdFx0OiBmb2xkZXI/LndvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0XHRcdH0pXSxcblx0XHRcdHtcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWw6IChlbGVtZW50OiBDaGFuZ2VzVHJlZUVsZW1lbnQpID0+IGlzQ2hhbmdlc0ZpbGVJdGVtKGVsZW1lbnQpID8gYmFzZW5hbWUoZWxlbWVudC51cmkpIDogZWxlbWVudC5uYW1lLFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ2NoYW5nZXNWaWV3VHJlZScsIFwiQ2hhbmdlcyBUcmVlXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRuZDoge1xuXHRcdFx0XHRcdGdldERyYWdVUkk6IChlbGVtZW50OiBDaGFuZ2VzVHJlZUVsZW1lbnQpID0+IGVsZW1lbnQudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0Z2V0RHJhZ0xhYmVsOiAoZWxlbWVudHMpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHVyaXMgPSBlbGVtZW50cy5tYXAoZSA9PiBlLnVyaSk7XG5cdFx0XHRcdFx0XHRpZiAodXJpcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHVyaXNbMF0sIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gYCR7dXJpcy5sZW5ndGh9YDtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRvbkRyYWdPdmVyOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0XHRkcm9wOiAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0b25EcmFnU3RhcnQ6IChkYXRhLCBvcmlnaW5hbEV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBlbGVtZW50cyA9IGRhdGEuZ2V0RGF0YSgpIGFzIENoYW5nZXNUcmVlRWxlbWVudFtdO1xuXHRcdFx0XHRcdFx0XHRjb25zdCB1cmlzID0gZWxlbWVudHMuZmlsdGVyKGlzQ2hhbmdlc0ZpbGVJdGVtKS5tYXAoZSA9PiBlLnVyaSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gZmlsbEVkaXRvcnNEcmFnRGF0YShhY2Nlc3NvciwgdXJpcywgb3JpZ2luYWxFdmVudCkpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHRcdC8vIG5vb3Bcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0SWQ6IChlbGVtZW50OiBDaGFuZ2VzVHJlZUVsZW1lbnQpID0+IGVsZW1lbnQudXJpLnRvU3RyaW5nKClcblx0XHRcdFx0fSxcblx0XHRcdFx0aW5kZW50OiB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS52aWV3TW9kZU9icy5nZXQoKSA9PT0gQ2hhbmdlc1ZpZXdNb2RlLkxpc3QgPyAwIDogOCxcblx0XHRcdFx0Y29tcHJlc3Npb25FbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzb3J0ZXI6IG5ldyBDaGFuZ2VzVHJlZVNvcnRlcigoKSA9PiB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS52aWV3TW9kZU9icy5nZXQoKSksXG5cdFx0XHRcdHR3aXN0aWVBZGRpdGlvbmFsQ3NzQ2xhc3M6IChlOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLnZpZXdNb2RlT2JzLmdldCgpID09PSBDaGFuZ2VzVmlld01vZGUuTGlzdFxuXHRcdFx0XHRcdFx0PyAnZm9yY2Utbm8tdHdpc3RpZSdcblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdCkpO1xuXHR9XG5cblx0YXN5bmMgb3BlbkNoYW5nZXMocmVzb3VyY2U/OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpdGVtcyA9IHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzT2JzLmdldCgpO1xuXHRcdGlmIChpdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zaG91bGRPcGVuTW9kYWxEaWZmKCkpIHtcblx0XHRcdGNvbnN0IGNoYW5nZXMgPSB0b0lDaGFuZ2VzRmlsZUl0ZW0oaXRlbXMpO1xuXHRcdFx0Y29uc3QgY2hhbmdlVG9PcGVuID0gcmVzb3VyY2UgPyBjaGFuZ2VzLmZpbmQoYyA9PiBpc0VxdWFsKGMudXJpLCByZXNvdXJjZSkpIDogdW5kZWZpbmVkO1xuXHRcdFx0YXdhaXQgdGhpcy5fb3BlbkZpbGVJdGVtKGNoYW5nZVRvT3BlbiA/PyBjaGFuZ2VzWzBdLCBjaGFuZ2VzLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCBjaGFuZ2VzLmxlbmd0aCA+IDEpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE9wZW4gbXVsdGktZmlsZSBkaWZmIGVkaXRvclxuXHRcdGF3YWl0IHRoaXMuX29wZW5NdWx0aUZpbGVEaWZmRWRpdG9yKHJlc291cmNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXJzIHRoZSBmaWxlcyBoZWFkZXIgKEJyYW5jaCBDaGFuZ2VzIGRyb3Bkb3duICsgZGlmZiBzdGF0cykgaW50byB0aGUgcGFuZWwuXG5cdCAqIFN0YW5kYXJkIGxheW91dCBvbmx5OyB7QGxpbmsgU2luZ2xlUGFuZUNoYW5nZXNWaWV3UGFuZX0gb3ZlcnJpZGVzIHRoaXMgdG8gYSBuby1vcFxuXHQgKiBiZWNhdXNlIHRoZSBoZWFkZXIgbGl2ZXMgaW4gdGhlIGN1c3RvbSBDaGFuZ2VzIGVkaXRvciBpbnN0ZWFkLlxuXHQgKi9cblx0cHJvdGVjdGVkIGNyZWF0ZUZpbGVzSGVhZGVyKGNvbnRlbnRDb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5maWxlc0hlYWRlck5vZGUgPSBkb20uYXBwZW5kKGNvbnRlbnRDb250YWluZXIsICQoJy5jaGFuZ2VzLWZpbGVzLWhlYWRlcicpKTtcblxuXHRcdGNvbnN0IGZpbGVzSGVhZGVyVG9vbGJhckNvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5maWxlc0hlYWRlck5vZGUsICQoJy5jaGFuZ2VzLWZpbGVzLWhlYWRlci10b29sYmFyJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGZpbGVzSGVhZGVyVG9vbGJhckNvbnRhaW5lciwgTWVudUlkLkNoYXRFZGl0aW5nU2Vzc2lvbkNoYW5nZXNGaWxlSGVhZGVyVG9vbGJhciwge1xuXHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24pID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gJ2NoYXRFZGl0aW5nLnZlcnNpb25zUGlja2VyJyAmJiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYW5nZXNQaWNrZXJBY3Rpb25JdGVtLCBhY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuZmlsZUhlYWRlclRvb2xiYXJDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuZmlsZXNIZWFkZXJOb2RlLCAkKCcuY2hhbmdlcy1maWxlcy1oZWFkZXItcmlnaHQtdG9vbGJhcicpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0aGlzLmZpbGVIZWFkZXJUb29sYmFyQ29udGFpbmVyLCBNZW51SWQuQ2hhdEVkaXRpbmdTZXNzaW9uQ2hhbmdlc0ZpbGVIZWFkZXJSaWdodFRvb2xiYXIsIHtcblx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IENoYW5nZXNEaWZmU3RhdHNBY3Rpb24uSUQgJiYgYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGFuZ2VzRGlmZlN0YXRzQWN0aW9uSXRlbSwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVycyB0aGUgQ3JlYXRlLVBSIGFjdGlvbnMgYnV0dG9uIGJhciBpbnRvIHRoZSBhY3Rpb25zIGNvbnRhaW5lci4gU3RhbmRhcmRcblx0ICogbGF5b3V0IG9ubHk7IHtAbGluayBTaW5nbGVQYW5lQ2hhbmdlc1ZpZXdQYW5lfSBvdmVycmlkZXMgdGhpcyB0byBhIG5vLW9wIGJlY2F1c2Vcblx0ICogdGhlIGFjdGlvbnMgcmVuZGVyIGluIHRoZSBDaGFuZ2VzIGVkaXRvciBoZWFkZXIgaW5zdGVhZC5cblx0ICovXG5cdHByb3RlY3RlZCBjcmVhdGVBY3Rpb25zQnV0dG9uQmFyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5hY3Rpb25zQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNBZ2VudEhvc3RTZXNzaW9uT2JzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIGFjdGl2ZVNlc3Npb24gPyBpc0FnZW50SG9zdFByb3ZpZGVySWQoYWN0aXZlU2Vzc2lvbi5wcm92aWRlcklkKSA6IGZhbHNlO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLmFjdGlvbnNDb250YWluZXIhKTtcblxuXHRcdFx0Y29uc3QgaXNBZ2VudEhvc3RTZXNzaW9uID0gaXNBZ2VudEhvc3RTZXNzaW9uT2JzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gaXNBZ2VudEhvc3RTZXNzaW9uXG5cdFx0XHRcdD8gdGhpcy5zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGFuZ2VzV29ya2JlbmNoQnV0dG9uQmFyV2lkZ2V0LCB0aGlzLmFjdGlvbnNDb250YWluZXIhKVxuXHRcdFx0XHQ6IHRoaXMuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhbmdlc01lbnVXb3JrYmVuY2hCdXR0b25CYXJXaWRnZXQsIHRoaXMuYWN0aW9uc0NvbnRhaW5lciEsIHRoaXMuaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc09icyk7XG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHdpZGdldCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGFjdGlvbnMgY29udGFpbmVyIHNob3VsZCBiZSBzaG93biBmb3IgdGhlIGdpdmVuIHNlc3Npb24gc3RhdGUuXG5cdCAqIFN0YW5kYXJkIGxheW91dCBzaG93cyBpdCBmb3Igbm9uLXVudGl0bGVkIHNlc3Npb25zOyB7QGxpbmsgU2luZ2xlUGFuZUNoYW5nZXNWaWV3UGFuZX1cblx0ICogbmV2ZXIgc2hvd3MgaXQgKHRoZSBhY3Rpb25zIGxpdmUgaW4gdGhlIENoYW5nZXMgZWRpdG9yKS5cblx0ICovXG5cdHByb3RlY3RlZCBpc0FjdGlvbnNDb250YWluZXJWaXNpYmxlKGlzVW50aXRsZWQ6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIWlzVW50aXRsZWQ7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciBjbGlja2luZyBhIGZpbGUgb3BlbnMgdGhlIG1vZGFsIHNpbmdsZS1maWxlIGRpZmYuIHtAbGluayBTaW5nbGVQYW5lQ2hhbmdlc1ZpZXdQYW5lfVxuXHQgKiBuZXZlciB1c2VzIHRoZSBtb2RhbCBlZGl0b3IuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgc2hvdWxkT3Blbk1vZGFsRGlmZigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCd3b3JrYmVuY2guZWRpdG9yLnVzZU1vZGFsJykgPT09ICdhbGwnO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgY2xpY2tpbmcgYSBmaWxlIG9wZW5zIGEgc2luZ2xlLWZpbGUgZGlmZiBieSBkZWZhdWx0ICh2cyB0aGVcblx0ICogbXVsdGktZmlsZSBkaWZmIGVkaXRvcikuIEFsdCBpbnZlcnRzIHRoaXMuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgc2hvdWxkT3BlblNpbmdsZUZpbGVEaWZmQnlEZWZhdWx0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFNFU1NJT05TX0NIQU5HRVNfT1BFTl9TSU5HTEVfRklMRV9ESUZGX1NFVFRJTkcpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldmVhbCB0aGUgQ0kgY2hlY2tzIHNlY3Rpb246IGV4cGFuZCBpdCBpZiBjb2xsYXBzZWQgYW5kIG1vdmUga2V5Ym9hcmRcblx0ICogZm9jdXMgaW50byBpdC4gTm8tb3Agd2hlbiB0aGVyZSBhcmUgbm8gY2hlY2tzIHRvIHNob3cuXG5cdCAqL1xuXHRyZXZlYWxDaGVja3MoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNpU3RhdHVzV2lkZ2V0IHx8ICF0aGlzLmNpU3RhdHVzV2lkZ2V0LnZpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jaVN0YXR1c1dpZGdldC5leHBhbmQoKTtcblx0XHR0aGlzLmNpU3RhdHVzV2lkZ2V0LmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9vcGVuRmlsZUl0ZW0oaXRlbTogSUNoYW5nZXNGaWxlSXRlbSwgaXRlbXM6IElDaGFuZ2VzRmlsZUl0ZW1bXSwgc2lkZUJ5U2lkZTogYm9vbGVhbiwgcHJlc2VydmVGb2N1czogYm9vbGVhbiwgcGlubmVkOiBib29sZWFuLCBpbmNsdWRlU2lkZWJhcjogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgdXJpOiBtb2RpZmllZEZpbGVVcmksIG9yaWdpbmFsVXJpLCBpc0RlbGV0aW9uIH0gPSBpdGVtO1xuXHRcdGNvbnN0IGN1cnJlbnRJbmRleCA9IGl0ZW1zLmluZGV4T2YoaXRlbSk7XG5cblx0XHRjb25zdCBzaWRlYmFyID0gaW5jbHVkZVNpZGViYXIgPyB7XG5cdFx0XHRyZW5kZXI6IChjb250YWluZXI6IHVua25vd24sIG9uRGlkTGF5b3V0OiBFdmVudDx7IHJlYWRvbmx5IGhlaWdodDogbnVtYmVyOyByZWFkb25seSB3aWR0aDogbnVtYmVyIH0+LCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlclNpZGViYXJMaXN0KGNvbnRhaW5lciBhcyBIVE1MRWxlbWVudCwgb25EaWRMYXlvdXQsIGNvbnRleHRLZXlTZXJ2aWNlLCBpdGVtcywgdGhpcy5fb3BlbkZpbGVJdGVtLmJpbmQodGhpcykpO1xuXHRcdFx0fVxuXHRcdH0gOiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBuYXZpZ2F0aW9uID0ge1xuXHRcdFx0dG90YWw6IGl0ZW1zLmxlbmd0aCxcblx0XHRcdGN1cnJlbnQ6IGN1cnJlbnRJbmRleCxcblx0XHRcdG5hdmlnYXRlOiAoaW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSBpdGVtc1tpbmRleF07XG5cdFx0XHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdFx0XHR0aGlzLl9vcGVuRmlsZUl0ZW0odGFyZ2V0LCBpdGVtcywgZmFsc2UsIGZhbHNlLCBmYWxzZSwgaW5jbHVkZVNpZGViYXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGdyb3VwID0gc2lkZUJ5U2lkZSA/IFNJREVfR1JPVVAgOiBBQ1RJVkVfR1JPVVA7XG5cdFx0Y29uc3QgbGFiZWxzID0gZ2V0Q2hhbmdlc0VkaXRvckxhYmVscyhpdGVtLnVyaSwgdGhpcy5sYWJlbFNlcnZpY2UpO1xuXG5cdFx0aWYgKGlzRGVsZXRpb24gJiYgb3JpZ2luYWxVcmkpIHtcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0cmVzb3VyY2U6IG9yaWdpbmFsVXJpLFxuXHRcdFx0XHQuLi5sYWJlbHMsXG5cdFx0XHRcdG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1cywgcGlubmVkLCBtb2RhbDogeyBzaWRlYmFyLCBuYXZpZ2F0aW9uIH0gfVxuXHRcdFx0fSwgZ3JvdXApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChvcmlnaW5hbFVyaSkge1xuXHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogb3JpZ2luYWxVcmkgfSxcblx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IG1vZGlmaWVkRmlsZVVyaSB9LFxuXHRcdFx0XHQuLi5sYWJlbHMsXG5cdFx0XHRcdG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1cywgcGlubmVkLCBtb2RhbDogeyBzaWRlYmFyLCBuYXZpZ2F0aW9uIH0gfVxuXHRcdFx0fSwgZ3JvdXApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdHJlc291cmNlOiBtb2RpZmllZEZpbGVVcmksXG5cdFx0XHQuLi5sYWJlbHMsXG5cdFx0XHRvcHRpb25zOiB7IHByZXNlcnZlRm9jdXMsIHBpbm5lZCwgbW9kYWw6IHsgc2lkZWJhciwgbmF2aWdhdGlvbiB9IH1cblx0XHR9LCBncm91cCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9vcGVuU2luZ2xlRmlsZURpZmZFZGl0b3IoaXRlbTogSUNoYW5nZXNGaWxlSXRlbSwgc2lkZUJ5U2lkZTogYm9vbGVhbiwgcHJlc2VydmVGb2N1czogYm9vbGVhbiwgcGlubmVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyB1cmksIG9yaWdpbmFsVXJpLCBpc0RlbGV0aW9uIH0gPSBpdGVtO1xuXHRcdGNvbnN0IGdyb3VwID0gc2lkZUJ5U2lkZSA/IFNJREVfR1JPVVAgOiBBQ1RJVkVfR1JPVVA7XG5cdFx0Y29uc3QgbGFiZWxzID0gZ2V0Q2hhbmdlc0VkaXRvckxhYmVscyh1cmksIHRoaXMubGFiZWxTZXJ2aWNlKTtcblxuXHRcdC8vIEFsd2F5cyBvcGVuIGEgZGlmZiBlZGl0b3IuIEFkZGVkIGZpbGVzIChubyBvcmlnaW5hbCkgYW5kIGRlbGV0ZWQgZmlsZXNcblx0XHQvLyAobm8gbW9kaWZpZWQpIGFyZSBzaG93biBhcyBhIGRpZmYgYWdhaW5zdCBhbiBlbXB0eSBzaWRlLCBtYXRjaGluZyB0aGVcblx0XHQvLyBcIk9wZW4gQ2hhbmdlc1wiIGFjdGlvbi5cblx0XHRjb25zdCBtb2RpZmllZFVyaSA9IGlzRGVsZXRpb24gPyB1bmRlZmluZWQgOiB1cmk7XG5cdFx0Y29uc3QgcGFuZSA9IGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBvcmlnaW5hbFVyaSB9LFxuXHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IG1vZGlmaWVkVXJpIH0sXG5cdFx0XHQuLi5sYWJlbHMsXG5cdFx0XHRvcHRpb25zOiB7IHByZXNlcnZlRm9jdXMsIHBpbm5lZCB9XG5cdFx0fSwgZ3JvdXApO1xuXG5cdFx0Ly8gU2hvdyB0aGUgd2hvbGUgZmlsZSByYXRoZXIgdGhhbiBmb2xkaW5nIHVuY2hhbmdlZCByZWdpb25zLCBzaW5jZSB0aGlzXG5cdFx0Ly8gZGlmZiBpcyBvcGVuZWQgdG8gcmV2aWV3IG9uZSBzcGVjaWZpYyBmaWxlLiBObyBvcGVuLWNhbGwgb3B0aW9uIGV4aXN0c1xuXHRcdC8vIGZvciB0aGlzLCBzbyBhcHBseSBpdCB2aWEgdXBkYXRlT3B0aW9ucygpIG9uY2UgdGhlIHBhbmUgcmVzb2x2ZXMgLSBidXRcblx0XHQvLyB0aGUgcGFuZSdzIGRpZmYgZWRpdG9yIGNvbnRyb2wgaXMgcmV1c2VkIGFjcm9zcyBkaWZmZXJlbnQgaW5wdXRzLCBzb1xuXHRcdC8vIHJlc3RvcmUgdGhlIGNvbmZpZ3VyZWQgdmFsdWUgb25jZSB0aGlzIGlucHV0IGlzIG5vIGxvbmdlciBhY3RpdmUsXG5cdFx0Ly8gcmF0aGVyIHRoYW4gbGVhdmluZyB0aGUgb3ZlcnJpZGUgc3R1Y2sgZm9yIHdoYXRldmVyIG9wZW5zIG5leHQuXG5cdFx0Y29uc3QgY29udHJvbCA9IHBhbmU/LmdldENvbnRyb2woKTtcblx0XHRpZiAocGFuZSAmJiBpc0RpZmZFZGl0b3IoY29udHJvbCkpIHtcblx0XHRcdGNvbnN0IG9wZW5lZElucHV0ID0gcGFuZS5pbnB1dDtcblx0XHRcdGNvbnRyb2wudXBkYXRlT3B0aW9ucyh7IGhpZGVVbmNoYW5nZWRSZWdpb25zOiB7IGVuYWJsZWQ6IGZhbHNlIH0gfSk7XG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9IHBhbmUuZ3JvdXAub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRpZiAocGFuZS5ncm91cC5hY3RpdmVFZGl0b3IgPT09IG9wZW5lZElucHV0KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0Y29udHJvbC51cGRhdGVPcHRpb25zKHsgaGlkZVVuY2hhbmdlZFJlZ2lvbnM6IHsgZW5hYmxlZDogdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZGlmZkVkaXRvci5oaWRlVW5jaGFuZ2VkUmVnaW9ucy5lbmFibGVkJykgfSB9KTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIobGlzdGVuZXIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29wZW5NdWx0aUZpbGVEaWZmRWRpdG9yKHJldmVhbD86IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZU9icy5nZXQoKTtcblx0XHRjb25zdCBjaGFuZ2VzID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNPYnMuZ2V0KCk7XG5cblx0XHRpZiAoIXNlc3Npb25SZXNvdXJjZSB8fCBjaGFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE9wZW5pbmcgYSBmaWxlIGRpZmYgaXMgYSBkZWxpYmVyYXRlIGFjdGlvbiwgc28gcmV2ZWFsIHRoZSAocG9zc2libHkgaGlkZGVuKVxuXHRcdC8vIGVkaXRvciBhcmVhIGV4cGxpY2l0bHkgdG8gc2hvdyBpdC4gVGhlIENoYW5nZXMgZWRpdG9yIGlzIG90aGVyd2lzZSBleGNsdWRlZFxuXHRcdC8vIGZyb20gYXV0byByZXZlYWwtb24tb3BlbiwgYW5kIHRoZSBleHBsaWNpdCByZXZlYWwgaXMgbm90IHVuZG9uZSBieSB0aGVcblx0XHQvLyBhdXRvbWF0aWMgc2luZ2xlLXBhbmUgaGlkZSBydWxlcy5cblx0XHQodGhpcy53b3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGFzIElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UpLnJldmVhbEVkaXRvclBhcnRFeHBsaWNpdGx5KCk7XG5cblx0XHQvLyBEZXRlcm1pbmUgdGhlIHJldmVhbCB0YXJnZXQgKG9yaWdpbmFsL21vZGlmaWVkIFVSSSBwYWlyKSBmcm9tIHRoZVxuXHRcdC8vIGN1cnJlbnQgY2hhbmdlIGxpc3QsIHNvIHRoZSBtdWx0aS1kaWZmIGVkaXRvciBjYW4gbmF2aWdhdGUgdG8gaXQuXG5cdFx0bGV0IG9wdGlvbnM6IElNdWx0aURpZmZFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChyZXZlYWwpIHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNoYW5nZXMuZmluZChjID0+IGlzRXF1YWwoYy5tb2RpZmllZFVyaSwgcmV2ZWFsKSk7XG5cdFx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHRcdG9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0dmlld1N0YXRlOiB7XG5cdFx0XHRcdFx0XHRyZXZlYWxEYXRhOiB7XG5cdFx0XHRcdFx0XHRcdHJlc291cmNlOiB7XG5cdFx0XHRcdFx0XHRcdFx0b3JpZ2luYWw6IHRhcmdldC5vcmlnaW5hbFVyaSxcblx0XHRcdFx0XHRcdFx0XHRtb2RpZmllZDogdGFyZ2V0Lm1vZGlmaWVkVXJpLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJTXVsdGlEaWZmRWRpdG9yT3B0aW9ucztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBPcGVuIHRoZSBzZXNzaW9uIENoYW5nZXMgZWRpdG9yIHVzaW5nIHRoZSBzZXNzaW9ucyBzb3VyY2UgVVJJLiBUaGVcblx0XHQvLyByZXNvdXJjZSBsaXN0IGlzIHJlc29sdmVkIHZpYSBgQ2hhbmdlc011bHRpRGlmZlNvdXJjZVJlc29sdmVyYCBhbmRcblx0XHQvLyB1cGRhdGVzIHJlYWN0aXZlbHkgYXMgYGFjdGl2ZVNlc3Npb25DaGFuZ2VzT2JzYCBjaGFuZ2VzLlxuXHRcdGF3YWl0IHRoaXMuc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLm9wZW5DaGFuZ2VzRWRpdG9yKHNlc3Npb25SZXNvdXJjZSwgb3B0aW9ucyk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZSA9IHVuZGVmaW5lZDtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBDaGFuZ2VzIHZpZXcgZm9yIHRoZSBzaW5nbGUtcGFuZSBsYXlvdXQ6IHRoZSBmaWxlcyBsaXN0IGxpdmVzIGluIHRoZSBkb2NrZWRcbiAqIGRldGFpbCBwYW5lbCB3aGlsZSB0aGUgQnJhbmNoIENoYW5nZXMgaGVhZGVyLCBDcmVhdGUtUFIgYWN0aW9ucywgYW5kIGRpZmZzIGFyZVxuICogc2hvd24gaW4gdGhlIGN1c3RvbSBDaGFuZ2VzIGVkaXRvci4gT3ZlcnJpZGVzIHRoZSBzdGFuZGFyZCBob29rcyB0byBvbWl0IHRoZVxuICogaW4tcGFuZWwgaGVhZGVyL2FjdGlvbnMuXG4gKi9cbmV4cG9ydCBjbGFzcyBTaW5nbGVQYW5lQ2hhbmdlc1ZpZXdQYW5lIGV4dGVuZHMgQ2hhbmdlc1ZpZXdQYW5lIHtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlRmlsZXNIZWFkZXIoX2NvbnRlbnRDb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Ly8gTm8gaW4tcGFuZWwgaGVhZGVyIGluIHNpbmdsZS1wYW5lOyBpdCBsaXZlcyBpbiB0aGUgQ2hhbmdlcyBlZGl0b3IuXG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlQWN0aW9uc0J1dHRvbkJhcigpOiB2b2lkIHtcblx0XHQvLyBObyBpbi1wYW5lbCBDcmVhdGUtUFIgYWN0aW9ucyBpbiBzaW5nbGUtcGFuZTsgdGhleSBsaXZlIGluIHRoZSBDaGFuZ2VzIGVkaXRvciBoZWFkZXIuXG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgaXNBY3Rpb25zQ29udGFpbmVyVmlzaWJsZShfaXNVbnRpdGxlZDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzaG91bGRPcGVuTW9kYWxEaWZmKCk6IGJvb2xlYW4ge1xuXHRcdC8vIFNpbmdsZS1wYW5lIG5ldmVyIHVzZXMgdGhlIG1vZGFsIGVkaXRvci5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYW5nZXNWaWV3UGFuZUNvbnRhaW5lciBleHRlbmRzIFZpZXdQYW5lQ29udGFpbmVyIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRCwgeyBtZXJnZVZpZXdXaXRoQ29udGFpbmVyV2hlblNpbmdsZVZpZXc6IHRydWUgfSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIGV4dGVuc2lvblNlcnZpY2UsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGNvbnRleHRTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY3JlYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5jcmVhdGUocGFyZW50KTtcblx0XHRwYXJlbnQuY2xhc3NMaXN0LmFkZCgnY2hhbmdlcy12aWV3bGV0Jyk7XG5cdH1cbn1cblxuLy8gLS0tIEFjdGlvbiBSdW5uZXJcblxuY2xhc3MgQ2hhbmdlc1ZpZXdBY3Rpb25SdW5uZXIgZXh0ZW5kcyBBY3Rpb25SdW5uZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZ2V0U2Vzc2lvblJlc291cmNlOiAoKSA9PiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBnZXRTZXNzaW9uRGlzY2FyZFJlZjogKCkgPT4gc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZ2V0U2VsZWN0ZWRGaWxlSXRlbXM6ICgpID0+IElDaGFuZ2VzRmlsZUl0ZW1bXVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIHJ1bkFjdGlvbihhY3Rpb246IElBY3Rpb24sIGNvbnRleHQ6IENoYW5nZXNUcmVlRWxlbWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHN1cGVyLnJ1bkFjdGlvbihhY3Rpb24sIGNvbnRleHQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuZ2V0U2Vzc2lvblJlc291cmNlKCk7XG5cdFx0Y29uc3QgZGlzY2FyZFJlZiA9IHRoaXMuZ2V0U2Vzc2lvbkRpc2NhcmRSZWYoKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLmdldFNlbGVjdGVkRmlsZUl0ZW1zKCk7XG5cblx0XHRjb25zdCBjb250ZXh0SXNTZWxlY3RlZCA9IHNlbGVjdGlvbi5zb21lKHMgPT4gcyA9PT0gY29udGV4dCk7XG5cdFx0Y29uc3QgYWN0dWFsQ29udGV4dCA9IGNvbnRleHRJc1NlbGVjdGVkID8gc2VsZWN0aW9uIDogW2NvbnRleHRdO1xuXHRcdGNvbnN0IGFyZ3MgPSBhY3R1YWxDb250ZXh0Lm1hcChlID0+IHtcblx0XHRcdGlmIChSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUoZSkpIHtcblx0XHRcdFx0cmV0dXJuIFJlc291cmNlVHJlZS5jb2xsZWN0KGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gaXNDaGFuZ2VzRmlsZUl0ZW0oZSkgPyBbZV0gOiBbXTtcblx0XHR9KS5mbGF0KCk7XG5cdFx0YXdhaXQgYWN0aW9uLnJ1bihzZXNzaW9uUmVzb3VyY2UsIGRpc2NhcmRSZWYsIC4uLmFyZ3MubWFwKGl0ZW0gPT4gaXRlbS51cmkpKTtcblx0fVxufVxuXG4vLyAtLS0gVHJlZSBEZWxlZ2F0ZSBhbmQgU29ydGVyXG5cbmNsYXNzIENoYW5nZXNUcmVlRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxDaGFuZ2VzVHJlZUVsZW1lbnQ+IHtcblx0c3RhdGljIHJlYWRvbmx5IFJPV19IRUlHSFQgPSAyMjtcblxuXHRnZXRIZWlnaHQoX2VsZW1lbnQ6IENoYW5nZXNUcmVlRWxlbWVudCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIENoYW5nZXNUcmVlRGVsZWdhdGUuUk9XX0hFSUdIVDtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoX2VsZW1lbnQ6IENoYW5nZXNUcmVlRWxlbWVudCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIENoYW5nZXNUcmVlUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdH1cbn1cblxuY2xhc3MgQ2hhbmdlc1RyZWVTb3J0ZXIgaW1wbGVtZW50cyBJVHJlZVNvcnRlcjxDaGFuZ2VzVHJlZUVsZW1lbnQ+IHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSB2aWV3TW9kZTogKCkgPT4gQ2hhbmdlc1ZpZXdNb2RlKSB7IH1cblxuXHRjb21wYXJlKGE6IENoYW5nZXNUcmVlRWxlbWVudCwgYjogQ2hhbmdlc1RyZWVFbGVtZW50KTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy52aWV3TW9kZSgpID09PSBDaGFuZ2VzVmlld01vZGUuTGlzdCkge1xuXHRcdFx0Ly8gTGlzdFxuXHRcdFx0Y29uc3QgYVBhdGggPSAoYSBhcyBJQ2hhbmdlc0ZpbGVJdGVtKS51cmkuZnNQYXRoO1xuXHRcdFx0Y29uc3QgYlBhdGggPSAoYiBhcyBJQ2hhbmdlc0ZpbGVJdGVtKS51cmkuZnNQYXRoO1xuXG5cdFx0XHRyZXR1cm4gY29tcGFyZVBhdGhzKGFQYXRoLCBiUGF0aCk7XG5cdFx0fVxuXG5cdFx0Ly8gVHJlZVxuXHRcdGNvbnN0IGFJc0RpcmVjdG9yeSA9IFJlc291cmNlVHJlZS5pc1Jlc291cmNlTm9kZShhKTtcblx0XHRjb25zdCBiSXNEaXJlY3RvcnkgPSBSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUoYik7XG5cblx0XHRpZiAoYUlzRGlyZWN0b3J5ICE9PSBiSXNEaXJlY3RvcnkpIHtcblx0XHRcdHJldHVybiBhSXNEaXJlY3RvcnkgPyAtMSA6IDE7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYU5hbWUgPSBSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUoYSlcblx0XHRcdD8gYS5uYW1lXG5cdFx0XHQ6IGJhc2VuYW1lKChhIGFzIElDaGFuZ2VzRmlsZUl0ZW0pLnVyaSk7XG5cdFx0Y29uc3QgYk5hbWUgPSBSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUoYilcblx0XHRcdD8gYi5uYW1lXG5cdFx0XHQ6IGJhc2VuYW1lKChiIGFzIElDaGFuZ2VzRmlsZUl0ZW0pLnVyaSk7XG5cblx0XHRyZXR1cm4gY29tcGFyZUZpbGVOYW1lcyhhTmFtZSwgYk5hbWUpO1xuXHR9XG59XG5cbi8vIC0tLSBWaWV3IE1vZGUgQWN0aW9uc1xuXG5jbGFzcyBTZXRDaGFuZ2VzTGlzdFZpZXdNb2RlQWN0aW9uIGV4dGVuZHMgVmlld0FjdGlvbjxDaGFuZ2VzVmlld1BhbmU+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guY2hhbmdlc1ZpZXcuYWN0aW9uLnNldExpc3RWaWV3TW9kZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NldExpc3RWaWV3TW9kZScsIFwiVmlldyBhcyBMaXN0XCIpLFxuXHRcdFx0dmlld0lkOiBDSEFOR0VTX1ZJRVdfSUQsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRpY29uOiBDb2RpY29uLmxpc3RGbGF0LFxuXHRcdFx0dG9nZ2xlZDogQ2hhbmdlc0NvbnRleHRLZXlzLlZpZXdNb2RlLmlzRXF1YWxUbyhDaGFuZ2VzVmlld01vZGUuTGlzdCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEVkaXRpbmdTZXNzaW9uVGl0bGVUb29sYmFyLFxuXHRcdFx0XHRncm91cDogJzFfdmlld21vZGUnLFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfdmlldzogQ2hhbmdlc1ZpZXdQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bG9nQ2hhbmdlc1ZpZXdWaWV3TW9kZUNoYW5nZShhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpLCBDaGFuZ2VzVmlld01vZGUuTGlzdCk7XG5cdFx0YWNjZXNzb3IuZ2V0KElDaGFuZ2VzVmlld1NlcnZpY2UpLnNldFZpZXdNb2RlKENoYW5nZXNWaWV3TW9kZS5MaXN0KTtcblx0fVxufVxuXG5jbGFzcyBTZXRDaGFuZ2VzVHJlZVZpZXdNb2RlQWN0aW9uIGV4dGVuZHMgVmlld0FjdGlvbjxDaGFuZ2VzVmlld1BhbmU+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guY2hhbmdlc1ZpZXcuYWN0aW9uLnNldFRyZWVWaWV3TW9kZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NldFRyZWVWaWV3TW9kZScsIFwiVmlldyBhcyBUcmVlXCIpLFxuXHRcdFx0dmlld0lkOiBDSEFOR0VTX1ZJRVdfSUQsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRpY29uOiBDb2RpY29uLmxpc3RUcmVlLFxuXHRcdFx0dG9nZ2xlZDogQ2hhbmdlc0NvbnRleHRLZXlzLlZpZXdNb2RlLmlzRXF1YWxUbyhDaGFuZ2VzVmlld01vZGUuVHJlZSksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEVkaXRpbmdTZXNzaW9uVGl0bGVUb29sYmFyLFxuXHRcdFx0XHRncm91cDogJzFfdmlld21vZGUnLFxuXHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfdmlldzogQ2hhbmdlc1ZpZXdQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bG9nQ2hhbmdlc1ZpZXdWaWV3TW9kZUNoYW5nZShhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpLCBDaGFuZ2VzVmlld01vZGUuVHJlZSk7XG5cdFx0YWNjZXNzb3IuZ2V0KElDaGFuZ2VzVmlld1NlcnZpY2UpLnNldFZpZXdNb2RlKENoYW5nZXNWaWV3TW9kZS5UcmVlKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoU2V0Q2hhbmdlc0xpc3RWaWV3TW9kZUFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU2V0Q2hhbmdlc1RyZWVWaWV3TW9kZUFjdGlvbik7XG5cbi8vIC0tLSBWZXJzaW9ucyBQaWNrZXIgQWN0aW9uXG5cbmNsYXNzIFZlcnNpb25zUGlja2VyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdjaGF0RWRpdGluZy52ZXJzaW9uc1BpY2tlcic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFZlcnNpb25zUGlja2VyQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdEVkaXRpbmcudmVyc2lvbnNQaWNrZXInLCAnVmVyc2lvbnMnKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5saXN0RmlsdGVyLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdGluZ1Nlc3Npb25DaGFuZ2VzRmlsZUhlYWRlclRvb2xiYXIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiA5LFxuXHRcdFx0XHR3aGVuOiBBY3RpdmVTZXNzaW9uQ29udGV4dEtleXMuSGFzR2l0UmVwb3NpdG9yeSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25zRWRpdG9ySGVhZGVyUHJpbWFyeSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cy5IYXNHaXRSZXBvc2l0b3J5LFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7IH1cbn1cbnJlZ2lzdGVyQWN0aW9uMihWZXJzaW9uc1BpY2tlckFjdGlvbik7XG5cbmV4cG9ydCBjbGFzcyBDaGFuZ2VzUGlja2VyQWN0aW9uSXRlbSBleHRlbmRzIEFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uVmlld0l0ZW0ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IE1lbnVJdGVtQWN0aW9uLFxuXHRcdEBJQWN0aW9uV2lkZ2V0U2VydmljZSBhY3Rpb25XaWRnZXRTZXJ2aWNlOiBJQWN0aW9uV2lkZ2V0U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhbmdlc1ZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhbmdlc1ZpZXdTZXJ2aWNlOiBJQ2hhbmdlc1ZpZXdTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBhY3Rpb25Qcm92aWRlcjogSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uUHJvdmlkZXIgPSB7XG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNoYW5nZXNldHMgPSBjaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldHNPYnMuZ2V0KCkgPz8gW107XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGVkQ2hhbmdlc2V0ID0gY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRPYnMuZ2V0KCk7XG5cblx0XHRcdFx0cmV0dXJuIGNoYW5nZXNldHMubWFwKGNoYW5nZXNldCA9PiAoe1xuXHRcdFx0XHRcdC4uLmFjdGlvbixcblx0XHRcdFx0XHRpZDogYGFnZW50cy5jaGFuZ2VzLmNoYW5nZXNldC4ke2NoYW5nZXNldC5pZH1gLFxuXHRcdFx0XHRcdGxhYmVsOiBjaGFuZ2VzZXQubGFiZWwsXG5cdFx0XHRcdFx0ZGV0YWlsOiBjaGFuZ2VzZXQuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0Y2hlY2tlZDogc2VsZWN0ZWRDaGFuZ2VzZXQ/LmlkID09PSBjaGFuZ2VzZXQuaWQsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IHtcblx0XHRcdFx0XHRcdGxhYmVsOiBjaGFuZ2VzZXQuY2F0ZWdvcnkgPz8gJycsXG5cdFx0XHRcdFx0XHRzaG93SGVhZGVyOiBmYWxzZSxcblx0XHRcdFx0XHRcdG9yZGVyOiAwXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRlbmFibGVkOiBjaGFuZ2VzZXQuaXNFbmFibGVkLmdldCgpLFxuXHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y2hhbmdlc1ZpZXdTZXJ2aWNlLnNldENoYW5nZXNldElkKGNoYW5nZXNldC5pZCk7XG5cdFx0XHRcdFx0XHRsb2dDaGFuZ2VzVmlld1ZlcnNpb25Nb2RlQ2hhbmdlKHRoaXMudGVsZW1ldHJ5U2VydmljZSwgY2hhbmdlc2V0LmlkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gc2F0aXNmaWVzIElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbikpO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0c3VwZXIoYWN0aW9uLCB7IGFjdGlvblByb3ZpZGVyLCBsaXN0T3B0aW9uczogeyBkZXRhaWxJdGVtSGVpZ2h0OiA0NCB9IH0sIGFjdGlvbldpZGdldFNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9icy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJMYWJlbCh0aGlzLmVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYW5nZXMtcGlja2VyLWFjdGlvbi1yaWNoJyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyTGFiZWwoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB8IG51bGwge1xuXHRcdGNvbnN0IGNoYW5nZXNldCA9IHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRPYnMuZ2V0KCk7XG5cdFx0aWYgKCFjaGFuZ2VzZXQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGRvbS5yZXNldChlbGVtZW50LCBkb20uJCgnc3BhbicsIHVuZGVmaW5lZCwgY2hhbmdlc2V0LmxhYmVsKSwgLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoJyQoY2hldnJvbi1kb3duKScpKTtcblx0XHR0aGlzLnVwZGF0ZUFyaWFMYWJlbCgpO1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG5cbi8vIC0tLSBEaWZmIFN0YXRzIEFjdGlvbnNcbi8vXG4vLyBUaGUgZWRpdG9yLWdyb3VwIGhlYWRlcidzIGxlZnQgdGl0bGUgYmFyIChTZXNzaW9uc0VkaXRvckhlYWRlclByaW1hcnkpIGFsd2F5cyByZW5kZXJzXG4vLyB0aGUgc2FtZSBkaWZmLXN0YXRzIGFjdGlvbiAoQ2hhbmdlc0RpZmZTdGF0c0FjdGlvbikgdGhhdCB0aGUgY2xhc3NpYyBDaGFuZ2VzIHZpZXdcbi8vIGhlYWRlciB1c2VzIFx1MjAxNCB0aGUgb25lIG90aGVyd2lzZSBzaG93biBvbmx5IHdoaWxlIHRoZSBlZGl0b3IgYXJlYSBpcyBjb2xsYXBzZWQgXHUyMDE0XG4vLyB3aGV0aGVyIHRoZSBlZGl0b3IgYXJlYSBpcyB2aXNpYmxlIG9yIGNsb3NlZC4gQ2xpY2tpbmcgaXQgb3BlbnMgKG9yIHJlLW9wZW5zKSB0aGVcbi8vIENoYW5nZXMgZWRpdG9yLiBJdCB1c2VzIFNpbmdsZVBhbmVDaGFuZ2VzRGlmZlN0YXRzQWN0aW9uSXRlbSwgYSByaWNoZXIgXCJOIGZpbGVzICtYIC1ZXCJcbi8vIHJlbmRlcmluZyAodGhlIGRldGFpbC1wYW5lbCBoZWFkZXIgdXNlcyB0aGUgY29tcGFjdCBhbmltYXRlZCBiYXNlIHJlbmRlcmluZyBpbnN0ZWFkKS5cblxuY2xhc3MgQ2hhbmdlc0RpZmZTdGF0c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNoYW5nZXNWaWV3LmFjdGlvbi52aWV3Q2hhbmdlcyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENoYW5nZXNEaWZmU3RhdHNBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGFuZ2VzVmlldy52aWV3Q2hhbmdlcycsICdWaWV3IEFsbCBDaGFuZ2VzJyksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFZGl0aW5nU2Vzc2lvbkNoYW5nZXNGaWxlSGVhZGVyUmlnaHRUb29sYmFyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmhhc0FnZW50U2Vzc2lvbkNoYW5nZXNcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25zRWRpdG9ySGVhZGVyUHJpbWFyeSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5oYXNBZ2VudFNlc3Npb25DaGFuZ2VzXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3ID0gdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQ8Q2hhbmdlc1ZpZXdQYW5lPihDSEFOR0VTX1ZJRVdfSUQpO1xuXHRcdGF3YWl0IHZpZXc/Lm9wZW5DaGFuZ2VzKCk7XG5cdH1cbn1cbnJlZ2lzdGVyQWN0aW9uMihDaGFuZ2VzRGlmZlN0YXRzQWN0aW9uKTtcblxuLyoqXG4gKiBPcGVucyB0aGUgQ2hhbmdlcyB2aWV3IGFuZCByZXZlYWxzIChleHBhbmRzICsgZm9jdXNlcykgdGhlIENJIGNoZWNrcyBzZWN0aW9uLlxuICogVXNlZCBieSB0aGUgQ0kgZmFpbHVyZXMgYmFubmVyIGFib3ZlIHRoZSBjaGF0IGlucHV0LlxuICovXG5jbGFzcyBSZXZlYWxDSUNoZWNrc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBSRVZFQUxfQ0lfQ0hFQ0tTX0NPTU1BTkRfSUQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFJldmVhbENJQ2hlY2tzQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmV2ZWFsQ2hlY2tzJywgJ1JldmVhbCBDaGVja3MnKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXcgPSBhd2FpdCB2aWV3c1NlcnZpY2Uub3BlblZpZXc8Q2hhbmdlc1ZpZXdQYW5lPihDSEFOR0VTX1ZJRVdfSUQsIHRydWUpO1xuXHRcdHZpZXc/LnJldmVhbENoZWNrcygpO1xuXHR9XG59XG5yZWdpc3RlckFjdGlvbjIoUmV2ZWFsQ0lDaGVja3NBY3Rpb24pO1xuXG5jbGFzcyBDaGFuZ2VzRGlmZlN0YXRzQWN0aW9uSXRlbSBleHRlbmRzIEFjdGlvblZpZXdJdGVtIHtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF93aWRnZXQ6IENoYW5nZXNTdW1tYXJ5V2lkZ2V0O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogTWVudUl0ZW1BY3Rpb24sXG5cdFx0b3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG51bGwsIGFjdGlvbiwgeyAuLi5vcHRpb25zLCBpY29uOiBmYWxzZSwgbGFiZWw6IGZhbHNlIH0pO1xuXG5cdFx0dGhpcy5fd2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhbmdlc1N1bW1hcnlXaWRnZXQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNoYW5nZXNTdW1tYXJ5ID0gdGhpcy5fd2lkZ2V0LnN1bW1hcnkucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGNoYW5nZXNTdW1tYXJ5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnVwZGF0ZVRvb2x0aXAoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGFuZ2VzLWRpZmYtc3RhdHMtYWN0aW9uJyk7XG5cblx0XHRpZiAoIXRoaXMubGFiZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlckxhYmVsQ29udGVudHModGhpcy5sYWJlbCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVycyB0aGUgZGlmZi1zdGF0cyBjb250ZW50IGludG8gdGhlIGFjdGlvbiBsYWJlbC4gVGhlIGJhc2Ugc2hvd3MgdGhlXG5cdCAqIGFuaW1hdGVkICsvLSBzdW1tYXJ5OyB7QGxpbmsgU2luZ2xlUGFuZUNoYW5nZXNEaWZmU3RhdHNBY3Rpb25JdGVtfSBvdmVycmlkZXNcblx0ICogdGhpcyB0byBhIHJpY2hlciBcIk4gZmlsZXMgK1ggLVlcIiBsYWJlbCBmb3IgdGhlIHNpbmdsZS1wYW5lIGVkaXRvciBoZWFkZXIuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgcmVuZGVyTGFiZWxDb250ZW50cyhsYWJlbDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQucmVuZGVyKGxhYmVsKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRUb29sdGlwKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY2hhbmdlc1N1bW1hcnkgPSB0aGlzLl93aWRnZXQuc3VtbWFyeS5nZXQoKTtcblx0XHRpZiAoY2hhbmdlc1N1bW1hcnkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB7IGZpbGVzLCBhZGRpdGlvbnMsIGRlbGV0aW9ucyB9ID0gY2hhbmdlc1N1bW1hcnk7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdjaGFuZ2VzVmlldy5kaWZmU3RhdHMubGFiZWwnLCAnezB9IGZpbGVzLCB7MX0gYWRkaXRpb25zLCB7Mn0gZGVsZXRpb25zJywgZmlsZXMsIGFkZGl0aW9ucywgZGVsZXRpb25zKTtcblx0fVxufVxuXG4vKipcbiAqIERpZmYtc3RhdHMgYWN0aW9uIGl0ZW0gZm9yIHRoZSBzaW5nbGUtcGFuZSBDaGFuZ2VzIGVkaXRvciBoZWFkZXI6IGEgcmljaGVyXG4gKiBcIk4gZmlsZXMgK1ggLVlcIiByZW5kZXJpbmcgKHRoZSBkZXRhaWwtcGFuZWwgaGVhZGVyIHVzZXMgdGhlIGNvbXBhY3QgYW5pbWF0ZWRcbiAqIGJhc2UgcmVuZGVyaW5nKS4gVW5saWtlIHRoZSBiYXNlIGl0ZW0gdGhpcyByZW1haW5zIGZ1bGx5IGludGVyYWN0aXZlIFx1MjAxNCBjbGlja2luZ1xuICogaXQgcnVucyB0aGUgYWN0aW9uIChvcGVucyB0aGUgQ2hhbmdlcyBlZGl0b3IpIHRoZSBzYW1lIGFzIHRoZSBiYXNlIHJlbmRlcmluZy5cbiAqIEFkZHMgdGhlIGBjaGFuZ2VzLWRpZmYtc3RhdHMtYWN0aW9uLXJpY2hgIG1hcmtlciBjbGFzcyBzbyBpdHMgc3R5bGluZyBhcHBsaWVzXG4gKiB3aGVyZXZlciBpdCByZW5kZXJzICh0aGUgY2xhc3NpYyBpbnRlcm5hbCBoZWFkZXIgb3IgdGhlIHNpbmdsZS1wYW5lIGVkaXRvci1ncm91cFxuICogaGVhZGVyKS5cbiAqL1xuZXhwb3J0IGNsYXNzIFNpbmdsZVBhbmVDaGFuZ2VzRGlmZlN0YXRzQWN0aW9uSXRlbSBleHRlbmRzIENoYW5nZXNEaWZmU3RhdHNBY3Rpb25JdGVtIHtcblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGFuZ2VzLWRpZmYtc3RhdHMtYWN0aW9uLXJpY2gnKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJMYWJlbENvbnRlbnRzKGxhYmVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHN1bW1hcnkgPSB0aGlzLl93aWRnZXQuc3VtbWFyeS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoc3VtbWFyeSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgeyBmaWxlcywgYWRkaXRpb25zLCBkZWxldGlvbnMgfSA9IHN1bW1hcnk7XG5cdFx0XHRjb25zdCBmaWxlc0xhYmVsID0gZmlsZXMgPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhbmdlc1ZpZXcuZGlmZlN0YXRzLmZpbGUnLCBcIjEgZmlsZVwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGFuZ2VzVmlldy5kaWZmU3RhdHMuZmlsZXMnLCBcInswfSBmaWxlc1wiLCBmaWxlcyk7XG5cblx0XHRcdGRvbS5yZXNldChcblx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdGRvbS4kKCdzcGFuLmNoYW5nZXMtZGlmZi1zdGF0cy1maWxlcycsIHVuZGVmaW5lZCwgZmlsZXNMYWJlbCksXG5cdFx0XHRcdGRvbS4kKCdzcGFuLndvcmtpbmctc2V0LWxpbmVzLWFkZGVkJywgdW5kZWZpbmVkLCBgKyR7YWRkaXRpb25zfWApLFxuXHRcdFx0XHRkb20uJCgnc3Bhbi53b3JraW5nLXNldC1saW5lcy1yZW1vdmVkJywgdW5kZWZpbmVkLCBgLSR7ZGVsZXRpb25zfWApXG5cdFx0XHQpO1xuXHRcdH0pKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsZ0JBQWdCLDBCQUFrRDtBQUMzRSxTQUFTLGVBQWU7QUFDeEIsU0FBUyw0QkFBNEI7QUFHckMsU0FBUyxjQUF1QixXQUFXLGVBQWUsZ0JBQWdCO0FBQzFFLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksdUJBQW9DO0FBQ3pELFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsU0FBUyxTQUFTLDRCQUF5QyxxQkFBcUIsdUJBQXVCO0FBQ2hILFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsVUFBVSxlQUFlO0FBQ2xDLFNBQVMsV0FBVztBQUNwQixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsd0JBQXdCLDBCQUEwQjtBQUMzRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFpQyxnQ0FBZ0Msc0JBQXNCO0FBQ3ZGLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsUUFBUSxTQUFTLGdCQUFnQixpQkFBaUIsb0JBQW9CO0FBQy9FLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZC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
