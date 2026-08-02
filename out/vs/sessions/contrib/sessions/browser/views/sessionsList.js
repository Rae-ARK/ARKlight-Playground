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
import "../media/sessionsList.css";
import * as DOM from "../../../../../base/browser/dom.js";
import { pauseCSSAnimationsWhenHidden, synchronizeCSSAnimations } from "../../../../../base/browser/animationSync.js";
import { Gesture } from "../../../../../base/browser/touch.js";
import { ListDragOverEffectPosition, ListDragOverEffectType, NotSelectableGroupId } from "../../../../../base/browser/ui/list/list.js";
import { ObjectTreeElementCollapseState } from "../../../../../base/browser/ui/tree/tree.js";
import { RenderIndentGuides, TreeFindMode } from "../../../../../base/browser/ui/tree/abstractTree.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { Emitter } from "../../../../../base/common/event.js";
import { HighlightedLabel } from "../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { createMatches } from "../../../../../base/common/filters.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { autorun, derived, observableSignalFromEvent, observableValue } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { fromNow } from "../../../../../base/common/date.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { localize } from "../../../../../nls.js";
import { MenuId, IMenuService, MenuItemAction } from "../../../../../platform/actions/common/actions.js";
import { MenuWorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { MarshalledId } from "../../../../../base/common/marshallingIds.js";
import { SessionProviderIdContext, SessionSupportsDeleteContext, SessionSupportsRenameContext, SessionTypeContext, IsPhoneLayoutContext, SessionIsArchivedContext, SessionIsReadContext, SessionHasPullRequestContext } from "../../../../common/contextkeys.js";
import { ARCHIVE_SESSION_COMMAND_ID, RENAME_SESSION_COMMAND_ID } from "../../../../common/sessionCommands.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { WorkbenchObjectTree } from "../../../../../platform/list/browser/listService.js";
import { defaultButtonStyles, defaultFindWidgetStyles, defaultInputBoxStyles, defaultToggleStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { asCssVariable } from "../../../../../platform/theme/common/colorUtils.js";
import { chartsOrange } from "../../../../../platform/theme/common/colors/chartsColors.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { getSessionWorkspaceKind, GITHUB_REMOTE_FILE_SCHEME, SessionStatus, SessionWorkspaceKind } from "../../../../services/sessions/common/session.js";
import { AgentSessionApprovalModel, agentSessionApprovalId } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js";
import { IVoicePlaybackService } from "../../../../../workbench/contrib/chat/common/voicePlaybackService.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { Action, ActionRunner, Separator, SubmenuAction } from "../../../../../base/common/actions.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { HoverStyle } from "../../../../../base/browser/ui/hover/hover.js";
import { HoverPosition } from "../../../../../base/browser/ui/hover/hoverWidget.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionsListModelService } from "../../../../services/sessions/browser/sessionsListModelService.js";
import { ISessionGroupsService } from "../../../../services/sessions/browser/sessionGroupsService.js";
import { ISessionSectionOrderService } from "../../../../services/sessions/browser/sessionSectionOrderService.js";
import { InputBox } from "../../../../../base/browser/ui/inputbox/inputBox.js";
import { IWorkbenchAssignmentService } from "../../../../../workbench/services/assignment/common/assignmentService.js";
import { IAgentSessionsService } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js";
import { IAgentHostFilterService } from "../../../../services/agentHostFilter/common/agentHostFilter.js";
import { LocalSelectionTransfer } from "../../../../../platform/dnd/browser/dnd.js";
import { DraggedSessionIdentifier, SessionsDataTransfers } from "../../../../browser/dnd.js";
import { ElementsDragAndDropData, ListViewTargetSector } from "../../../../../base/browser/ui/list/listView.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { buildSessionHoverContent } from "../sessionHoverContent.js";
import { SessionStatusIcon } from "../../../../browser/sessionStatusIcon.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { ILayoutService } from "../../../../../platform/layout/browser/layoutService.js";
import { createSessionArchiveAnimation } from "./sessionArchiveAnimation.js";
import { ChatAutomationsEnabledContext } from "../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js";
import { IAutomationService } from "../../../../../workbench/contrib/chat/common/automations/automationService.js";
import { ICustomViewService } from "../../../../services/customView/browser/customViewService.js";
import { AUTOMATIONS_CUSTOM_VIEW_ID } from "./automationsView.js";
const $ = DOM.$;
const AUTOMATIONS_SECTION_ID = "automations";
const SESSION_SECTION_FOCUS_FROM_POINTER_CLASS = "session-section-focus-from-pointer";
const SESSION_HEADER_DROP_TARGET_CLASS = "session-header-drop-target";
const SessionItemToolbarMenuId = new MenuId("SessionItemToolbar");
const SessionItemContextMenuId = MenuId.SessionItemContextMenu;
const SessionSectionToolbarMenuId = new MenuId("SessionSectionToolbar");
const SessionGroupToolbarMenuId = new MenuId("SessionGroupToolbar");
const SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING = "sessions.list.showEmptyDefaultGroups";
const IsSessionPinnedContext = new RawContextKey("sessionItem.isPinned", false);
const SessionItemHasBranchNameContext = new RawContextKey("sessionItem.hasBranchName", false);
const SessionItemStatusContext = new RawContextKey("sessionItem.status", SessionStatus.Completed);
const SessionItemInGroupContext = new RawContextKey("sessionItem.inGroup", false);
const SessionSectionTypeContext = new RawContextKey("sessionSection.type", "");
const SessionGroupHasVisibleSessionsContext = new RawContextKey("sessionGroup.hasVisibleSessions", false);
const SessionGroupIsEmptyContext = new RawContextKey("sessionGroup.isEmpty", false);
function shouldAnimateArchiveAction(actionId, sessionCount, motionReduced) {
  return actionId === ARCHIVE_SESSION_COMMAND_ID && sessionCount === 1 && !motionReduced;
}
var SessionsGrouping = /* @__PURE__ */ ((SessionsGrouping2) => {
  SessionsGrouping2["Workspace"] = "workspace";
  SessionsGrouping2["Date"] = "date";
  return SessionsGrouping2;
})(SessionsGrouping || {});
var SessionsSorting = /* @__PURE__ */ ((SessionsSorting2) => {
  SessionsSorting2["Created"] = "created";
  SessionsSorting2["Updated"] = "updated";
  return SessionsSorting2;
})(SessionsSorting || {});
function sortingToMode(sorting) {
  return sorting === "updated" /* Updated */ ? "updated" : "created";
}
const SORT_FALLBACK_STEP_MS = 6e4;
function isSessionGroupItem(item) {
  return "group" in item;
}
function isSessionSection(item) {
  return !isSessionGroupItem(item) && "sessions" in item && Array.isArray(item.sessions);
}
function isSessionShowMore(item) {
  return "showMore" in item && item.showMore === true;
}
function isSessionPlaceholder(item) {
  return "placeholder" in item && item.placeholder === true;
}
function isSessionItem(item) {
  return !isSessionGroupItem(item) && !isSessionSection(item) && !isSessionShowMore(item) && !isSessionPlaceholder(item);
}
const SHOW_MORE_FOLDERS_LABEL = "__more_folders__";
const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1e3;
const DEFAULT_APPROVAL_ROW_MAX_LINES = 3;
const _SessionsTreeDelegate = class _SessionsTreeDelegate {
  constructor(_approvalModel, _isPhone, _approvalRowMaxLines = DEFAULT_APPROVAL_ROW_MAX_LINES, _ciFixModel = void 0) {
    this._approvalModel = _approvalModel;
    this._isPhone = _isPhone;
    this._approvalRowMaxLines = _approvalRowMaxLines;
    this._ciFixModel = _ciFixModel;
  }
  getHeight(element) {
    if (isSessionSection(element) || isSessionGroupItem(element)) {
      return _SessionsTreeDelegate.SECTION_HEIGHT;
    }
    if (isSessionShowMore(element)) {
      return _SessionsTreeDelegate.SHOW_MORE_HEIGHT;
    }
    if (isSessionPlaceholder(element)) {
      return _SessionsTreeDelegate.PLACEHOLDER_HEIGHT;
    }
    let height;
    if (this._isPhone()) {
      height = _SessionsTreeDelegate.ITEM_HEIGHT_PHONE;
    } else if (isQuickChatSession(element)) {
      height = _SessionsTreeDelegate.ITEM_HEIGHT_QUICK_CHAT;
    } else {
      height = _SessionsTreeDelegate.ITEM_HEIGHT;
    }
    if (this._approvalModel) {
      const approval = getFirstApprovalAcrossChats(this._approvalModel, element, void 0);
      if (approval) {
        height += SessionItemRenderer.getApprovalRowHeight(approval.label, this._approvalRowMaxLines);
      }
    }
    if (this._ciFixModel && this._ciFixModel.getCIFix(element).get()) {
      height += SessionItemRenderer.CI_ROW_HEIGHT;
    }
    return height;
  }
  hasDynamicHeight(element) {
    return (!!this._approvalModel || !!this._ciFixModel) && isSessionItem(element);
  }
  getTemplateId(element) {
    if (isSessionGroupItem(element)) {
      return SessionGroupRenderer.TEMPLATE_ID;
    }
    if (isSessionSection(element)) {
      return SessionSectionRenderer.TEMPLATE_ID;
    }
    if (isSessionShowMore(element)) {
      return SessionShowMoreRenderer.TEMPLATE_ID;
    }
    if (isSessionPlaceholder(element)) {
      return SessionPlaceholderRenderer.TEMPLATE_ID;
    }
    return SessionItemRenderer.TEMPLATE_ID;
  }
};
_SessionsTreeDelegate.ITEM_HEIGHT = 54;
/** Quick-chat rows are single-line — see the `.session-item.quick-chat` rules in `sessionsList.css`. */
_SessionsTreeDelegate.ITEM_HEIGHT_QUICK_CHAT = 28;
/**
 * Phone layout uses a taller row so the inline action toolbar can
 * meet the 44px minimum touch target without overflowing. Sized to
 * fit a 44px toolbar centered between the title and details rows.
 * Keep in sync with the `.phone-layout .session-item` rules in
 * `sessionsList.css`.
 */
_SessionsTreeDelegate.ITEM_HEIGHT_PHONE = 76;
_SessionsTreeDelegate.SECTION_HEIGHT = 26;
_SessionsTreeDelegate.SHOW_MORE_HEIGHT = 26;
_SessionsTreeDelegate.PLACEHOLDER_HEIGHT = 26;
let SessionsTreeDelegate = _SessionsTreeDelegate;
class SessionItemActionRunner extends ActionRunner {
  constructor(getMultiSelectedSessions, handleAction) {
    super();
    this.getMultiSelectedSessions = getMultiSelectedSessions;
    this.handleAction = handleAction;
  }
  async runAction(action, context) {
    if (context && !Array.isArray(context)) {
      if (this.handleAction && await this.handleAction(action, context)) {
        return;
      }
      await super.runAction(action, this.getMultiSelectedSessions(context));
      return;
    }
    await super.runAction(action, context);
  }
}
const SESSION_TITLE_SHIMMER_ANIMATION_NAME = "session-title-shimmer";
const SESSION_TITLE_SHIMMER_ANIMATION_NAMES = /* @__PURE__ */ new Set([SESSION_TITLE_SHIMMER_ANIMATION_NAME]);
const SESSION_TITLE_SHIMMER_PAUSED_CLASS = "session-title-shimmer-paused";
const _SessionItemRenderer = class _SessionItemRenderer {
  constructor(options, approvalModel, ciFixModel, instantiationService, contextKeyService, markdownRendererService, hoverService, sessionsProvidersService, agentSessionsService, _voicePlaybackService) {
    this.options = options;
    this.approvalModel = approvalModel;
    this.ciFixModel = ciFixModel;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.markdownRendererService = markdownRendererService;
    this.hoverService = hoverService;
    this.sessionsProvidersService = sessionsProvidersService;
    this.agentSessionsService = agentSessionsService;
    this._voicePlaybackService = _voicePlaybackService;
    this.templateId = _SessionItemRenderer.TEMPLATE_ID;
    this._onDidChangeItemHeight = new Emitter();
    this.onDidChangeItemHeight = this._onDidChangeItemHeight.event;
    this._onDidApproveSession = new Emitter();
    /** Fires when the user approves a session's pending action via its "Allow" button. */
    this.onDidApproveSession = this._onDidApproveSession.event;
    this._templatesBySession = /* @__PURE__ */ new Map();
  }
  static getApprovalRowHeight(label, maxLines = DEFAULT_APPROVAL_ROW_MAX_LINES) {
    const lineCount = Math.min(label.split(/\r?\n/).length, maxLines);
    return lineCount * _SessionItemRenderer._APPROVAL_ROW_LINE_HEIGHT + _SessionItemRenderer._APPROVAL_ROW_OVERHEAD;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    container.classList.add("session-item");
    const iconContainer = DOM.append(container, $(".session-icon"));
    const statusIcon = disposables.add(this.instantiationService.createInstance(SessionStatusIcon, iconContainer));
    const mainCol = DOM.append(container, $(".session-main"));
    const titleRow = DOM.append(mainCol, $(".session-title-row"));
    const titleContainer = DOM.append(titleRow, $(".session-title"));
    const title = disposables.add(new HighlightedLabel(titleContainer));
    disposables.add(DOM.addDisposableListener(titleContainer, DOM.EventType.ANIMATION_START, (e) => {
      if (e.target === titleContainer && e.animationName === SESSION_TITLE_SHIMMER_ANIMATION_NAME) {
        synchronizeCSSAnimations(titleContainer, { animationNames: SESSION_TITLE_SHIMMER_ANIMATION_NAMES });
      }
    }));
    disposables.add(pauseCSSAnimationsWhenHidden(titleContainer, {
      pausedClass: SESSION_TITLE_SHIMMER_PAUSED_CLASS,
      animationNames: SESSION_TITLE_SHIMMER_ANIMATION_NAMES
    }));
    const titleToolbarContainer = DOM.append(titleRow, $(".session-title-toolbar"));
    const pendingVoiceIndicator = DOM.append(titleRow, $(".session-pending-voice-indicator"));
    for (const eventType of ["pointerdown", "pointerup", "click", "dblclick"]) {
      disposables.add(DOM.addDisposableListener(titleToolbarContainer, eventType, (e) => e.stopPropagation()));
    }
    disposables.add(Gesture.ignoreTarget(titleToolbarContainer));
    const detailsRow = DOM.append(mainCol, $(".session-details-row"));
    const approvalRow = DOM.append(mainCol, $(".session-approval-row"));
    const approvalLabel = DOM.append(approvalRow, $("span.session-approval-label"));
    const approvalButtonContainer = DOM.append(approvalRow, $(".session-approval-button"));
    const ciRow = DOM.append(mainCol, $(".session-ci-row"));
    const ciLabel = DOM.append(ciRow, $("span.session-ci-label"));
    const ciButtonContainer = DOM.append(ciRow, $(".session-ci-button"));
    for (const eventType of ["pointerdown", "pointerup", "click", "dblclick"]) {
      disposables.add(DOM.addDisposableListener(ciRow, eventType, (e) => e.stopPropagation()));
    }
    disposables.add(Gesture.ignoreTarget(ciRow));
    const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
    const statusContext = SessionItemStatusContext.bindTo(contextKeyService);
    const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    let titleToolbar;
    if (this.options.toolbarMenuId) {
      const actionRunner = disposables.add(new SessionItemActionRunner(this.options.getMultiSelectedSessions, this.options.handleToolbarAction));
      titleToolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, titleToolbarContainer, this.options.toolbarMenuId, {
        menuOptions: { shouldForwardArgs: true },
        actionRunner
      }));
    }
    return { container, statusIcon, title, titleContainer, titleToolbar, pendingVoiceIndicator, detailsRow, approvalRow, approvalLabel, approvalButtonContainer, ciRow, ciLabel, ciButtonContainer, contextKeyService, statusContext, disposables, elementDisposables, sessionResource: void 0, archiveAnimation: void 0 };
  }
  renderElement(node, _index, template) {
    const element = node.element;
    if (!isSessionItem(element)) {
      return;
    }
    this.renderSession(element, template, createMatches(node.filterData));
  }
  renderSession(element, template, matches) {
    this.bindTemplateToSession(template, element);
    template.elementDisposables.clear();
    if (this.options.onDidRequestRename) {
      template.elementDisposables.add(DOM.addDisposableListener(template.title.element, DOM.EventType.DBLCLICK, (event) => {
        if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !element.capabilities.get().supportsRename) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.options.onDidRequestRename?.(element);
      }));
    }
    this.agentSessionsService.model.observeSession(element.resource);
    if (this.options.showHover) {
      template.elementDisposables.add(this.hoverService.setupDelayedHover(template.container, () => ({
        content: buildSessionHoverContent(element, this.sessionsProvidersService),
        appearance: { showPointer: true },
        position: { hoverPosition: HoverPosition.RIGHT, forcePosition: true },
        persistence: { hideOnHover: false }
      }), { groupId: "sessions-list" }));
    }
    const pendingVoiceResource = element.resource;
    template.pendingVoiceIndicator.className = "session-pending-voice-indicator " + ThemeIcon.asClassName(Codicon.unmute);
    template.elementDisposables.add(this.hoverService.setupManagedHover(
      getDefaultHoverDelegate("mouse"),
      template.pendingVoiceIndicator,
      localize("pendingVoiceResponse", "Voice response ready")
    ));
    template.elementDisposables.add(autorun((reader) => {
      this._voicePlaybackService.pendingResponseVersion.read(reader);
      template.pendingVoiceIndicator.classList.toggle("visible", this._voicePlaybackService.hasPendingResponse(pendingVoiceResource));
    }));
    if (template.titleToolbar) {
      template.titleToolbar.context = element;
    }
    const isPinned = this.options.isPinned(element);
    IsSessionPinnedContext.bindTo(template.contextKeyService).set(isPinned);
    SessionIsArchivedContext.bindTo(template.contextKeyService).set(element.isArchived.get());
    SessionIsReadContext.bindTo(template.contextKeyService).set(this.options.isRead(element));
    SessionItemHasBranchNameContext.bindTo(template.contextKeyService).set(!!element.workspace.get()?.folders[0]?.gitRepository?.branchName?.trim());
    template.elementDisposables.add(autorun((reader) => {
      const isArchived = element.isArchived.read(reader);
      template.container.classList.toggle("archived", isArchived);
      template.container.classList.toggle("pinned", isPinned && !isArchived);
    }));
    template.elementDisposables.add(autorun((reader) => {
      const wrapper = this.options.visibleSessions.read(reader).find((s) => s?.sessionId === element.sessionId);
      const isSticky = wrapper ? wrapper.sticky.read(reader) : false;
      template.container.classList.toggle("sticky", isSticky);
    }));
    template.elementDisposables.add(autorun((reader) => {
      const sessionStatus = element.status.read(reader);
      template.statusContext.set(sessionStatus);
      const isRead = this.options.isRead(element);
      const isArchived = element.isArchived.read(reader);
      const gitHubInfo = element.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
      const isQuickChat = element.isQuickChat?.read(reader) ?? false;
      const completedStateIcon = gitHubInfo?.pullRequest?.icon;
      template.statusIcon.setStatus(sessionStatus, isRead, isArchived, completedStateIcon, element.resource);
      template.container.classList.toggle("in-progress", sessionStatus === SessionStatus.InProgress);
      template.container.classList.toggle("needs-input", sessionStatus === SessionStatus.NeedsInput);
      template.container.classList.toggle("unread", !isRead && !isArchived);
      template.container.classList.toggle("quick-chat", isQuickChat);
    }));
    template.elementDisposables.add(autorun((reader) => {
      const titleText = element.title.read(reader);
      template.title.set(titleText, matches);
    }));
    const timeDisposable = template.elementDisposables.add(new MutableDisposable());
    const descriptionDisposable = template.elementDisposables.add(new MutableDisposable());
    template.elementDisposables.add(autorun((reader) => {
      const sessionStatus = element.status.read(reader);
      const workspace = element.workspace.read(reader);
      const description = element.description.read(reader);
      const isQuickChat = element.isQuickChat?.read(reader) ?? false;
      DOM.clearNode(template.detailsRow);
      if (isQuickChat) {
        descriptionDisposable.clear();
        timeDisposable.clear();
        return;
      }
      const changes = element.changes.read(reader);
      const changesSummary = element.changesSummary?.read(reader);
      let timeDate;
      const hideDetails = sessionStatus === SessionStatus.InProgress || sessionStatus === SessionStatus.NeedsInput;
      if (!hideDetails) {
        timeDate = element.updatedAt.read(reader);
      }
      const parts = [];
      if (sessionStatus !== SessionStatus.InProgress) {
        const kind = getSessionWorkspaceKind(workspace, element.worktreePending?.read(reader));
        const icon = kind === SessionWorkspaceKind.Virtual ? Codicon.cloudCompact : kind === SessionWorkspaceKind.Folder ? Codicon.folderCompact : Codicon.worktreeCompact;
        const typeIconEl = DOM.append(template.detailsRow, $("span.session-details-icon"));
        DOM.append(typeIconEl, $(`span${ThemeIcon.asCSSSelector(icon)}`));
        parts.push(typeIconEl);
      }
      if (!hideDetails && workspace && (this.options.grouping() !== "workspace" /* Workspace */ || this.options.isPinned(element) || element.isArchived.read(reader))) {
        const badgeLabel = this.getWorkspaceBadgeLabel(workspace);
        if (badgeLabel) {
          const badgeEl = DOM.append(template.detailsRow, $("span.session-badge"));
          badgeEl.textContent = badgeLabel;
          parts.push(badgeEl);
        }
      }
      if (!hideDetails && (changesSummary || changes.length > 0)) {
        let insertions = 0, deletions = 0;
        if (changesSummary) {
          insertions = changesSummary.additions;
          deletions = changesSummary.deletions;
        } else if (changes.length > 0) {
          for (const change of changes) {
            insertions += change.insertions;
            deletions += change.deletions;
          }
        }
        if (insertions > 0 || deletions > 0) {
          if (parts.length > 0) {
            DOM.append(template.detailsRow, $("span.session-separator.has-separator"));
          }
          const diffEl = DOM.append(template.detailsRow, $("span.session-diff"));
          DOM.append(diffEl, $("span.session-diff-added")).textContent = `+${insertions}`;
          DOM.append(diffEl, $("span.session-diff-removed")).textContent = `-${deletions}`;
          parts.push(diffEl);
        }
      }
      if (sessionStatus === SessionStatus.InProgress) {
        if (parts.length > 0) {
          DOM.append(template.detailsRow, $("span.session-separator.has-separator"));
        }
        const statusEl = DOM.append(template.detailsRow, $("span.session-description"));
        if (description) {
          descriptionDisposable.value = this.markdownRendererService.render(description, { sanitizerConfig: { replaceWithPlaintext: true } }, statusEl);
        } else {
          descriptionDisposable.clear();
          statusEl.textContent = localize("working", "Working...");
        }
        parts.push(statusEl);
      } else if (sessionStatus === SessionStatus.NeedsInput) {
        if (parts.length > 0) {
          DOM.append(template.detailsRow, $("span.session-separator.has-separator"));
        }
        const statusEl = DOM.append(template.detailsRow, $("span.session-description"));
        if (description) {
          descriptionDisposable.value = this.markdownRendererService.render(description, { sanitizerConfig: { replaceWithPlaintext: true } }, statusEl);
        } else {
          descriptionDisposable.clear();
          statusEl.textContent = localize("needsInput", "Input needed");
        }
        parts.push(statusEl);
      } else if (sessionStatus === SessionStatus.Error) {
        if (parts.length > 0) {
          DOM.append(template.detailsRow, $("span.session-separator.has-separator"));
        }
        const statusEl = DOM.append(template.detailsRow, $("span.session-description"));
        if (description) {
          descriptionDisposable.value = this.markdownRendererService.render(description, { sanitizerConfig: { replaceWithPlaintext: true } }, statusEl);
        } else {
          descriptionDisposable.clear();
          statusEl.textContent = localize("failed", "Failed");
        }
        parts.push(statusEl);
      } else {
        descriptionDisposable.clear();
      }
      if (!hideDetails && timeDate) {
        if (parts.length > 0) {
          DOM.append(template.detailsRow, $("span.session-separator.has-separator"));
        }
        const timeEl = DOM.append(template.detailsRow, $("span.session-time"));
        const definiteTimeDate = timeDate;
        const formatTime = () => {
          const seconds = Math.round((Date.now() - definiteTimeDate.getTime()) / 1e3);
          return seconds < 60 ? localize("secondsDuration", "now") : fromNow(definiteTimeDate, true);
        };
        timeEl.textContent = formatTime();
        const targetWindow = DOM.getWindow(timeEl);
        const interval = targetWindow.setInterval(() => {
          timeEl.textContent = formatTime();
        }, 6e4);
        timeDisposable.value = toDisposable(() => targetWindow.clearInterval(interval));
      } else {
        timeDisposable.clear();
      }
    }));
    if (this.approvalModel) {
      this.renderApprovalRow(element, template);
    }
    if (this.ciFixModel) {
      this.renderCIRow(element, template);
    }
  }
  renderApprovalRow(element, template) {
    if (!this.approvalModel) {
      return;
    }
    const approvalModel = this.approvalModel;
    const initialInfo = getFirstApprovalAcrossChats(approvalModel, element, void 0);
    let wasVisible = !!initialInfo;
    template.approvalRow.classList.toggle("visible", wasVisible);
    const buttonStore = template.elementDisposables.add(new DisposableStore());
    template.elementDisposables.add(autorun((reader) => {
      buttonStore.clear();
      const info = getFirstApprovalAcrossChats(approvalModel, element, reader);
      const visible = !!info;
      template.approvalRow.classList.toggle("visible", visible);
      if (info) {
        const lines = info.label.split("\n");
        const maxLines = this.options.approvalRowMaxLines;
        const visibleLines = lines.slice(0, maxLines);
        if (lines.length > maxLines) {
          visibleLines[maxLines - 1] = `${visibleLines[maxLines - 1]} \u2026`;
        }
        const langId = info.languageId ?? "json";
        const labelContent = new MarkdownString();
        for (const line of visibleLines) {
          labelContent.appendCodeblock(langId, line);
        }
        template.approvalLabel.textContent = "";
        buttonStore.add(this.markdownRendererService.render(labelContent, {}, template.approvalLabel));
        if (this.options.showHover) {
          const fullContent = new MarkdownString().appendCodeblock(info.languageId ?? "json", info.label);
          buttonStore.add(this.hoverService.setupDelayedHover(template.approvalLabel, {
            content: fullContent,
            style: HoverStyle.Pointer,
            position: { hoverPosition: HoverPosition.BELOW }
          }));
        }
        template.approvalButtonContainer.textContent = "";
        const button = buttonStore.add(new Button(template.approvalButtonContainer, {
          title: localize("allowActionOnce", "Allow once"),
          secondary: true,
          ...defaultButtonStyles
        }));
        button.label = localize("allowAction", "Allow");
        buttonStore.add(button.onDidClick(() => {
          const approvalId = agentSessionApprovalId(info);
          info.confirm();
          this._onDidApproveSession.fire({ session: element, approvalId });
        }));
      }
      if (wasVisible !== visible) {
        wasVisible = visible;
        this._onDidChangeItemHeight.fire(element);
      }
    }));
  }
  renderCIRow(element, template) {
    if (!this.ciFixModel) {
      return;
    }
    const ciFixModel = this.ciFixModel;
    const stateObs = ciFixModel.getCIFix(element);
    let wasVisible = !!stateObs.get();
    template.ciRow.classList.toggle("visible", wasVisible);
    const buttonStore = template.elementDisposables.add(new DisposableStore());
    template.elementDisposables.add(autorun((reader) => {
      buttonStore.clear();
      const state = stateObs.read(reader);
      const visible = !!state;
      template.ciRow.classList.toggle("visible", visible);
      if (state) {
        template.ciLabel.textContent = localize("ci.blockedRow", "{0} checks failed, {1} pending", state.failed, state.pending);
        template.ciButtonContainer.textContent = "";
        const button = buttonStore.add(new Button(template.ciButtonContainer, {
          title: localize("ci.fixCITooltip", "Fix failing CI checks"),
          ...defaultButtonStyles,
          buttonBackground: asCssVariable(chartsOrange),
          buttonHoverBackground: `color-mix(in srgb, ${asCssVariable(chartsOrange)} 88%, black)`,
          buttonBorder: asCssVariable(chartsOrange)
        }));
        button.label = localize("ci.fixCI", "Fix CI");
        buttonStore.add(button.onDidClick(() => ciFixModel.fixCI(element)));
      }
      if (wasVisible !== visible) {
        wasVisible = visible;
        this._onDidChangeItemHeight.fire(element);
      }
    }));
  }
  getWorkspaceBadgeLabel(workspace) {
    const folder = workspace.folders[0];
    if (folder?.root.scheme === GITHUB_REMOTE_FILE_SCHEME) {
      const parts = folder.root.path.split("/").filter(Boolean);
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
    }
    return workspace.label;
  }
  startArchiveAnimation(session, overlayHost) {
    const template = this._templatesBySession.get(session.resource.toString());
    if (!template || !template.titleToolbar || template.container.ownerDocument.visibilityState === "hidden" || template.archiveAnimation) {
      return void 0;
    }
    const toolbarBounds = template.titleToolbar.getElement().getBoundingClientRect();
    let itemOffset = 0;
    let archiveActionBounds;
    for (let index = 0; index < template.titleToolbar.getItemsLength(); index++) {
      const itemWidth = template.titleToolbar.getItemWidth(index);
      if (template.titleToolbar.getItemAction(index)?.id === ARCHIVE_SESSION_COMMAND_ID) {
        archiveActionBounds = {
          left: toolbarBounds.left + itemOffset,
          top: toolbarBounds.top,
          width: itemWidth,
          height: toolbarBounds.height
        };
        break;
      }
      itemOffset += itemWidth;
    }
    if (!archiveActionBounds) {
      return void 0;
    }
    template.archiveAnimation = createSessionArchiveAnimation(template.container, archiveActionBounds, overlayHost);
    return template.archiveAnimation;
  }
  clearArchiveAnimation(session, animation) {
    const template = this._templatesBySession.get(session.resource.toString());
    if (template?.archiveAnimation === animation) {
      template.archiveAnimation = void 0;
    }
    animation.dispose();
  }
  bindTemplateToSession(template, session) {
    const sessionResource = session.resource.toString();
    if (template.sessionResource === sessionResource) {
      return;
    }
    this.unbindTemplate(template);
    template.sessionResource = sessionResource;
    this._templatesBySession.set(sessionResource, template);
  }
  unbindTemplate(template) {
    if (template.sessionResource && this._templatesBySession.get(template.sessionResource) === template) {
      this._templatesBySession.delete(template.sessionResource);
    }
    template.sessionResource = void 0;
    template.archiveAnimation?.dispose();
    template.archiveAnimation = void 0;
  }
  disposeElement(node, _index, template) {
    this.unbindTemplate(template);
    template.elementDisposables.clear();
  }
  disposeTemplate(template) {
    this.unbindTemplate(template);
    template.disposables.dispose();
  }
};
_SessionItemRenderer.TEMPLATE_ID = "session-item";
_SessionItemRenderer._APPROVAL_ROW_LINE_HEIGHT = 18;
_SessionItemRenderer._APPROVAL_ROW_OVERHEAD = 14;
/** Height of the single-line "Fix CI" row (label + orange button), including its top margin. */
_SessionItemRenderer.CI_ROW_HEIGHT = 32;
let SessionItemRenderer = _SessionItemRenderer;
const _SessionSectionRenderer = class _SessionSectionRenderer {
  constructor(hideSectionCount, instantiationService, contextKeyService, automationService, sessionsManagementService, customViewService) {
    this.hideSectionCount = hideSectionCount;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.automationService = automationService;
    this.sessionsManagementService = sessionsManagementService;
    this.customViewService = customViewService;
    this.templateId = _SessionSectionRenderer.TEMPLATE_ID;
    this.templatesByElement = /* @__PURE__ */ new WeakMap();
    this.templatesById = /* @__PURE__ */ new Map();
    this.automationStatus = derived(this, (reader) => {
      const runs = this.automationService.runs.read(reader);
      if (runs.some((run) => run.status === "pending" || run.status === "running")) {
        return SessionStatus.InProgress;
      }
      const hasUnreadRun = runs.some((run) => {
        if (run.status !== "completed" && run.status !== "failed" || !run.sessionResource) {
          return false;
        }
        const session = this.sessionsManagementService.getSession(URI.parse(run.sessionResource));
        return !!session && !session.isRead.read(reader);
      });
      if (hasUnreadRun) {
        return SessionStatus.Completed;
      }
      return void 0;
    });
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    container.classList.add("session-section");
    const icon = DOM.append(container, $("span.session-section-icon"));
    icon.setAttribute("aria-hidden", "true");
    const label = DOM.append(container, $("span.session-section-label"));
    const statusIndicator = DOM.append(container, $("span.session-section-status-indicator"));
    statusIndicator.setAttribute("aria-hidden", "true");
    const count = DOM.append(container, $("span.session-section-count"));
    const toolbarContainer = DOM.append(container, $(".session-section-toolbar"));
    const chevron = DOM.append(container, $("span.session-section-chevron"));
    chevron.setAttribute("aria-hidden", "true");
    const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
    const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    const toolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, SessionSectionToolbarMenuId, {
      menuOptions: { shouldForwardArgs: true }
    }));
    return { container, icon, statusIndicator, label, count, toolbar, chevron, contextKeyService, disposables, elementDisposables };
  }
  renderElement(node, _index, template) {
    const element = node.element;
    if (!isSessionSection(element)) {
      return;
    }
    template.elementDisposables.clear();
    this.templatesByElement.set(element, template);
    this.templatesById.set(element.id, template);
    template.container.classList.remove(SESSION_HEADER_DROP_TARGET_CLASS);
    template.container.classList.remove("session-section-shortcut");
    if (element.id === AUTOMATIONS_SECTION_ID) {
      template.container.classList.add("session-section-shortcut");
    }
    const sectionIcon = element.id === QUICK_CHATS_SECTION_ID ? Codicon.commentDiscussion : element.id === "pinned" ? Codicon.pinned : element.id === AUTOMATIONS_SECTION_ID ? Codicon.watch : void 0;
    template.icon.className = sectionIcon ? `session-section-icon ${ThemeIcon.asClassName(sectionIcon)}` : "session-section-icon";
    template.icon.style.display = sectionIcon ? "" : "none";
    if (element.id === AUTOMATIONS_SECTION_ID) {
      template.elementDisposables.add(autorun((reader) => {
        const activeCustomView = this.customViewService.activeCustomView.read(reader);
        template.container.classList.toggle("active", activeCustomView?.id === AUTOMATIONS_CUSTOM_VIEW_ID);
      }));
      DOM.clearNode(template.statusIndicator);
      const statusIcon = template.elementDisposables.add(this.instantiationService.createInstance(SessionStatusIcon, template.statusIndicator));
      template.elementDisposables.add(autorun((reader) => {
        const automationStatus = this.automationStatus.read(reader);
        if (automationStatus === SessionStatus.InProgress) {
          template.statusIndicator.style.display = "";
          statusIcon.setStatus(SessionStatus.InProgress, true, false);
        } else if (automationStatus === SessionStatus.Completed) {
          template.statusIndicator.style.display = "";
          statusIcon.setStatus(SessionStatus.Completed, false, false);
        } else {
          template.statusIndicator.style.display = "none";
        }
      }));
    } else {
      template.statusIndicator.style.display = "none";
      DOM.clearNode(template.statusIndicator);
    }
    template.label.textContent = element.label;
    if (this.hideSectionCount || element.id === AUTOMATIONS_SECTION_ID) {
      template.count.textContent = "";
      template.count.style.display = "none";
    } else {
      template.count.textContent = String(element.sessions.length);
      template.count.style.display = "";
    }
    this.updateChevron(template, node.collapsible, node.collapsed);
    const sectionType = element.id.startsWith("workspace:") ? "workspace" : element.id;
    SessionSectionTypeContext.bindTo(template.contextKeyService).set(sectionType);
    template.toolbar.context = element;
  }
  /**
   * Updates the expand/collapse chevron for an already-rendered section. The
   * tree only re-invokes `renderTwistie` (not `renderElement`) when a section's
   * collapse state toggles, so the owning list forwards collapse changes here.
   */
  updateCollapseState(element, collapsed) {
    const template = this.templatesByElement.get(element);
    if (template) {
      this.updateChevron(template, true, collapsed);
    }
  }
  setDropTarget(sectionId, active) {
    const template = this.templatesById.get(sectionId);
    template?.container.classList.toggle(SESSION_HEADER_DROP_TARGET_CLASS, active);
  }
  updateChevron(template, collapsible, collapsed) {
    template.chevron.className = "session-section-chevron";
    if (collapsible) {
      template.chevron.classList.add("collapsible");
      const icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
      template.chevron.classList.add(...ThemeIcon.asClassNameArray(icon));
    }
  }
  disposeElement(node, _index, template) {
    template.elementDisposables.clear();
    if (isSessionSection(node.element)) {
      this.templatesByElement.delete(node.element);
      this.templatesById.delete(node.element.id);
    }
  }
  disposeTemplate(template) {
    template.disposables.dispose();
  }
};
_SessionSectionRenderer.TEMPLATE_ID = "session-section";
let SessionSectionRenderer = _SessionSectionRenderer;
const _SessionGroupRenderer = class _SessionGroupRenderer {
  constructor(delegate, instantiationService, contextKeyService) {
    this.delegate = delegate;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.templateId = _SessionGroupRenderer.TEMPLATE_ID;
    this.templatesByElement = /* @__PURE__ */ new WeakMap();
    this.templatesById = /* @__PURE__ */ new Map();
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    container.classList.add("session-section", "session-group");
    const label = DOM.append(container, $("span.session-section-label"));
    const inputContainer = DOM.append(container, $(".session-group-input"));
    const toolbarContainer = DOM.append(container, $(".session-section-toolbar"));
    const chevron = DOM.append(container, $("span.session-section-chevron"));
    chevron.setAttribute("aria-hidden", "true");
    const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
    const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    const toolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, SessionGroupToolbarMenuId, {
      menuOptions: { shouldForwardArgs: true }
    }));
    return { container, label, inputContainer, toolbar, chevron, contextKeyService, disposables, elementDisposables: disposables.add(new DisposableStore()) };
  }
  renderElement(node, _index, template) {
    const element = node.element;
    if (!isSessionGroupItem(element)) {
      return;
    }
    template.elementDisposables.clear();
    this.templatesByElement.set(element, template);
    this.templatesById.set(element.group.id, template);
    template.container.classList.remove(SESSION_HEADER_DROP_TARGET_CLASS);
    template.label.textContent = element.group.name;
    this.updateChevron(template, node.collapsible, node.collapsed);
    SessionGroupHasVisibleSessionsContext.bindTo(template.contextKeyService).set(element.sessions.length > 0);
    SessionGroupIsEmptyContext.bindTo(template.contextKeyService).set(element.isEmpty);
    template.toolbar.context = element;
    template.container.classList.toggle("session-group-editing", element.editing);
    if (element.editing) {
      this.renderInput(element, template);
    } else {
      template.inputContainer.style.display = "none";
      template.label.style.display = "";
    }
  }
  renderInput(element, template) {
    template.label.style.display = "none";
    template.inputContainer.style.display = "";
    DOM.clearNode(template.inputContainer);
    const input = template.elementDisposables.add(new InputBox(template.inputContainer, void 0, {
      inputBoxStyles: defaultInputBoxStyles,
      ariaLabel: localize("sessionGroupName", "Group name")
    }));
    input.value = element.group.name;
    input.focus();
    input.select();
    let done = false;
    const commit = () => {
      if (done) {
        return;
      }
      done = true;
      this.delegate.commitEdit(element.group, input.value.trim());
    };
    const cancel = () => {
      if (done) {
        return;
      }
      done = true;
      this.delegate.cancelEdit(element.group);
    };
    template.elementDisposables.add(DOM.addStandardDisposableListener(input.inputElement, DOM.EventType.KEY_DOWN, (e) => {
      if (e.equals(KeyCode.Enter)) {
        e.preventDefault();
        e.stopPropagation();
        commit();
      } else if (e.equals(KeyCode.Escape)) {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    }));
    template.elementDisposables.add(DOM.addDisposableListener(input.inputElement, DOM.EventType.BLUR, () => commit()));
  }
  /** Forwarded from the owning list when the group's collapse state toggles. */
  updateCollapseState(element, collapsed) {
    const template = this.templatesByElement.get(element);
    if (template) {
      this.updateChevron(template, true, collapsed);
    }
  }
  setDropTarget(groupId, active) {
    const template = this.templatesById.get(groupId);
    template?.container.classList.toggle(SESSION_HEADER_DROP_TARGET_CLASS, active);
  }
  updateChevron(template, collapsible, collapsed) {
    template.chevron.className = "session-section-chevron";
    if (collapsible) {
      template.chevron.classList.add("collapsible");
      const icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
      template.chevron.classList.add(...ThemeIcon.asClassNameArray(icon));
    }
  }
  disposeElement(node, _index, template) {
    if (isSessionGroupItem(node.element)) {
      this.templatesByElement.delete(node.element);
      this.templatesById.delete(node.element.group.id);
    }
    template.elementDisposables.clear();
  }
  disposeTemplate(template) {
    template.disposables.dispose();
  }
};
_SessionGroupRenderer.TEMPLATE_ID = "session-group";
let SessionGroupRenderer = _SessionGroupRenderer;
const _SessionShowMoreRenderer = class _SessionShowMoreRenderer {
  constructor() {
    this.templateId = _SessionShowMoreRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    container.classList.add("session-show-more");
    return DOM.append(container, $("span.session-show-more-label"));
  }
  renderElement(node, _index, template) {
    const element = node.element;
    if (!isSessionShowMore(element)) {
      return;
    }
    const container = template.parentElement;
    container?.classList.toggle("session-show-more-folders", element.kind === "folders");
    if (element.mode === "less") {
      template.textContent = element.kind === "folders" ? localize("showLessWorkspacesCompact", "Show fewer workspaces") : localize("showLessCompact", "Show less");
    } else {
      template.textContent = element.kind === "folders" ? element.remainingCount === 1 ? localize("showMoreWorkspaceCompact", "+{0} more workspace", element.remainingCount) : localize("showMoreWorkspacesCompact", "+{0} more workspaces", element.remainingCount) : localize("showMoreCompact", "+{0} more", element.remainingCount);
    }
  }
  disposeTemplate(_template) {
  }
};
_SessionShowMoreRenderer.TEMPLATE_ID = "session-show-more";
let SessionShowMoreRenderer = _SessionShowMoreRenderer;
const _SessionPlaceholderRenderer = class _SessionPlaceholderRenderer {
  constructor(hoverService) {
    this.hoverService = hoverService;
    this.templateId = _SessionPlaceholderRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    container.classList.add("session-placeholder");
    return {
      container,
      label: DOM.append(container, $("span.session-placeholder-label")),
      hover: new MutableDisposable()
    };
  }
  renderElement(node, _index, template) {
    const element = node.element;
    if (!isSessionPlaceholder(element)) {
      return;
    }
    template.label.textContent = element.label;
    template.hover.value = element.hover ? this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), template.container, element.hover) : void 0;
  }
  disposeTemplate(template) {
    template.hover.dispose();
  }
};
_SessionPlaceholderRenderer.TEMPLATE_ID = "session-placeholder";
let SessionPlaceholderRenderer = _SessionPlaceholderRenderer;
class SessionsAccessibilityProvider {
  constructor(automationStatus) {
    this.automationStatus = automationStatus;
  }
  getWidgetAriaLabel() {
    return localize("sessionsList", "Sessions");
  }
  getAriaLabel(element) {
    if (isSessionGroupItem(element)) {
      return `${element.group.name}, ${element.sessions.length}`;
    }
    if (isSessionSection(element)) {
      if (element.id === AUTOMATIONS_SECTION_ID) {
        return this.automationStatus ? derived(this, (reader) => {
          switch (this.automationStatus?.read(reader)) {
            case SessionStatus.InProgress:
              return localize("automationsActiveAria", "{0}, run in progress", element.label);
            case SessionStatus.Completed:
              return localize("automationsUnreadRunAria", "{0}, unread run", element.label);
            default:
              return element.label;
          }
        }) : element.label;
      }
      return `${element.label}, ${element.sessions.length}`;
    }
    if (isSessionShowMore(element)) {
      if (element.mode === "less") {
        return element.kind === "folders" ? localize("showLessWorkspacesAria", "Show fewer workspaces") : localize("showLessAria", "Show fewer sessions");
      }
      return element.kind === "folders" ? element.remainingCount === 1 ? localize("showMoreWorkspaceAria", "Show {0} more workspace", element.remainingCount) : localize("showMoreWorkspacesAria", "Show {0} more workspaces", element.remainingCount) : localize("showMoreAria", "Show {0} more sessions", element.remainingCount);
    }
    if (isSessionPlaceholder(element)) {
      return element.hover ? localize("sessionPlaceholderAria", "{0}. {1}", element.label, element.hover) : element.label;
    }
    return derived(this, (reader) => {
      const title = element.title.read(reader);
      const updated = fromNow(element.updatedAt.read(reader), true);
      return element.worktreePending?.read(reader) ? localize("sessionItemWorktreePendingAria", "{0}, creating worktree, updated {1}", title, updated) : localize("sessionItemAria", "{0}, updated {1}", title, updated);
    });
  }
}
class SessionsListDragAndDrop extends Disposable {
  constructor(delegate) {
    super();
    this.delegate = delegate;
    this._transfer = LocalSelectionTransfer.getInstance();
  }
  getDragURI(element) {
    if (isSessionGroupItem(element)) {
      return `sessionGroup:${element.group.id}`;
    }
    if (isSessionSection(element)) {
      return element.id.startsWith("workspace:") ? `sessionWorkspace:${element.id}` : null;
    }
    if (isSessionShowMore(element)) {
      return null;
    }
    if (isSessionPlaceholder(element)) {
      return null;
    }
    return element.resource.toString();
  }
  getDragLabel(elements) {
    const groupItem = elements.find(isSessionGroupItem);
    if (groupItem) {
      return groupItem.group.name;
    }
    const workspaceSection = elements.find((e) => isSessionSection(e) && e.id.startsWith("workspace:"));
    if (workspaceSection) {
      return workspaceSection.label;
    }
    const sessions = this.toSessions(elements);
    if (sessions.length === 0) {
      return void 0;
    }
    if (sessions.length === 1) {
      return sessions[0].title.get();
    }
    return localize("sessions.dragLabel", "{0} sessions", sessions.length);
  }
  onDragStart(data, originalEvent) {
    const sessions = this.toSessions(data instanceof ElementsDragAndDropData ? data.elements : []);
    if (sessions.length === 0) {
      return;
    }
    const identifiers = sessions.map((s) => new DraggedSessionIdentifier(s.sessionId, s.resource));
    this._transfer.setData(identifiers, DraggedSessionIdentifier.prototype);
    if (originalEvent.dataTransfer) {
      const payload = JSON.stringify({ sessionId: sessions[0].sessionId, resource: sessions[0].resource.toString() });
      originalEvent.dataTransfer.setData(SessionsDataTransfers.SESSION, payload);
    }
  }
  onDragEnd() {
    this._transfer.clearData(DraggedSessionIdentifier.prototype);
    this.delegate.setDropTargetHeader(void 0);
  }
  onDragOver(data, targetElement, _targetIndex, targetSector) {
    const draggedHeader = this.draggedHeader(data);
    if (draggedHeader) {
      this.delegate.setDropTargetHeader(void 0);
      return this.onHeaderDragOver(draggedHeader, targetElement, targetSector);
    }
    const pinTarget = this.resolvePinTarget(data, targetElement, targetSector);
    if (pinTarget) {
      this.delegate.setDropTargetHeader(pinTarget.header);
      return this.toMembershipDropReaction(pinTarget);
    }
    const addToGroupTarget = this.resolveAddToGroupTarget(data, targetElement, targetSector);
    if (addToGroupTarget) {
      this.delegate.setDropTargetHeader(addToGroupTarget.header);
      return this.toMembershipDropReaction(addToGroupTarget);
    }
    this.delegate.setDropTargetHeader(void 0);
    const target = this.resolveReorderTarget(data, targetElement);
    if (!target) {
      return false;
    }
    const position = sectorToPosition(targetSector);
    return {
      accept: true,
      effect: {
        type: ListDragOverEffectType.Move,
        position: position === "after" ? ListDragOverEffectPosition.After : ListDragOverEffectPosition.Before
      }
    };
  }
  drop(data, targetElement, _targetIndex, targetSector) {
    this.delegate.setDropTargetHeader(void 0);
    try {
      const draggedHeader = this.draggedHeader(data);
      if (draggedHeader) {
        if (targetElement) {
          const targetRef = this.headerRefOf(targetElement);
          if (targetRef && targetRef !== draggedHeader.id) {
            this.delegate.reorderSection(draggedHeader.id, targetRef, sectorToPosition(targetSector), draggedHeader.isWorkspace);
          }
        }
        return;
      }
      const pinTarget = this.resolvePinTarget(data, targetElement, targetSector);
      if (pinTarget) {
        this.delegate.pinSessions(pinTarget.sessions, pinTarget.target, pinTarget.position);
        return;
      }
      const addToGroupTarget = this.resolveAddToGroupTarget(data, targetElement, targetSector);
      if (addToGroupTarget) {
        this.delegate.addSessionsToGroup(addToGroupTarget.sessions, addToGroupTarget.groupId, addToGroupTarget.target, addToGroupTarget.position);
        return;
      }
      const target = this.resolveReorderTarget(data, targetElement);
      if (!target) {
        return;
      }
      this.delegate.reorder(this.draggedSessions(data), target, sectorToPosition(targetSector));
    } finally {
      this.delegate.setDropTargetHeader(void 0);
    }
  }
  onHeaderDragOver(draggedHeader, targetElement, targetSector) {
    if (!targetElement) {
      return false;
    }
    const targetRef = this.headerRefOf(targetElement);
    if (!targetRef || targetRef === draggedHeader.id) {
      return false;
    }
    const position = sectorToPosition(targetSector);
    return {
      accept: true,
      effect: {
        type: ListDragOverEffectType.Move,
        position: position === "after" ? ListDragOverEffectPosition.After : ListDragOverEffectPosition.Before
      }
    };
  }
  resolvePinTarget(data, targetElement, targetSector) {
    if (!targetElement) {
      return void 0;
    }
    let target;
    if (isSessionSection(targetElement)) {
      if (targetElement.id !== "pinned") {
        return void 0;
      }
    } else if (isSessionItem(targetElement) && this.delegate.isSessionPinned(targetElement)) {
      target = targetElement;
    } else {
      return void 0;
    }
    const dragged = this.draggedSessions(data);
    const hasArchived = dragged.some((session) => session.isArchived.get());
    const allPinned = dragged.every((session) => this.delegate.isSessionPinned(session));
    if (dragged.length === 0 || hasArchived || allPinned) {
      return void 0;
    }
    if (target && dragged.some((session) => session.sessionId === target.sessionId)) {
      return void 0;
    }
    return {
      sessions: dragged,
      header: { kind: "section", id: "pinned" },
      target,
      position: target ? sectorToPosition(targetSector) : void 0
    };
  }
  resolveAddToGroupTarget(data, targetElement, targetSector) {
    if (!targetElement) {
      return void 0;
    }
    let groupId;
    let target;
    if (isSessionGroupItem(targetElement)) {
      groupId = targetElement.group.id;
    } else if (isSessionPlaceholder(targetElement) && targetElement.sectionId.startsWith("group:")) {
      groupId = targetElement.sectionId.slice("group:".length);
    } else if (isSessionItem(targetElement)) {
      groupId = this.delegate.getGroupIdOfSession(targetElement);
      target = groupId === void 0 ? void 0 : targetElement;
    }
    if (groupId === void 0) {
      return void 0;
    }
    const dragged = this.draggedSessions(data);
    const hasArchived = dragged.some((session) => session.isArchived.get());
    const allInGroup = dragged.every((session) => this.delegate.getGroupIdOfSession(session) === groupId);
    if (dragged.length === 0 || hasArchived || allInGroup) {
      return void 0;
    }
    if (target && dragged.some((session) => session.sessionId === target.sessionId)) {
      return void 0;
    }
    return {
      sessions: dragged,
      groupId,
      header: { kind: "group", id: groupId },
      target,
      position: target ? sectorToPosition(targetSector) : void 0
    };
  }
  /**
   * Resolve the session the drop should be positioned against, or `undefined`
   * if the current drag is not a valid in-list reorder.
   */
  resolveReorderTarget(data, targetElement) {
    if (!targetElement || !isSessionItem(targetElement)) {
      return void 0;
    }
    const target = targetElement;
    if (!this.delegate.isReorderable(target)) {
      return void 0;
    }
    const dragged = this.draggedSessions(data);
    if (dragged.length === 0 || dragged.some((s) => s.sessionId === target.sessionId)) {
      return void 0;
    }
    if (dragged.some((s) => !this.delegate.isReorderable(s))) {
      return void 0;
    }
    if (!this.delegate.canDropOn(dragged, target)) {
      return void 0;
    }
    return target;
  }
  toMembershipDropReaction(target) {
    let position = ListDragOverEffectPosition.Over;
    if (target.position === "after") {
      position = ListDragOverEffectPosition.After;
    } else if (target.position === "before") {
      position = ListDragOverEffectPosition.Before;
    }
    return {
      accept: true,
      effect: {
        type: ListDragOverEffectType.Move,
        position
      }
    };
  }
  draggedHeader(data) {
    if (!(data instanceof ElementsDragAndDropData)) {
      return void 0;
    }
    const elements = data.elements;
    const groupItem = elements.find(isSessionGroupItem);
    if (groupItem) {
      return { id: `group:${groupItem.group.id}`, isWorkspace: false };
    }
    const workspaceSection = elements.find((e) => isSessionSection(e) && e.id.startsWith("workspace:"));
    if (workspaceSection) {
      return { id: workspaceSection.id, isWorkspace: true };
    }
    return void 0;
  }
  /** The reorder identity of a top-level header element, or `undefined` when it is not reorderable. */
  headerRefOf(element) {
    if (isSessionGroupItem(element)) {
      return `group:${element.group.id}`;
    }
    if (isSessionSection(element) && element.id.startsWith("workspace:")) {
      return element.id;
    }
    return void 0;
  }
  draggedSessions(data) {
    return this.toSessions(data instanceof ElementsDragAndDropData ? data.elements : []);
  }
  toSessions(elements) {
    return elements.filter(isSessionItem);
  }
}
function sectorToPosition(sector) {
  return sector !== void 0 && sector >= ListViewTargetSector.CENTER_BOTTOM ? "after" : "before";
}
let SessionsList = class extends Disposable {
  constructor(container, options, _sessionsManagementService, _sessionsService, customViewService, _sessionsListModelService, _sessionGroupsService, _sessionSectionOrderService, _agentHostFilterService, instantiationService, contextKeyService, storageService, contextMenuService, menuService, keybindingService, commandService, automationService, _listVoicePlaybackService, assignmentService, configurationService, accessibilityService, layoutService) {
    super();
    this.options = options;
    this._sessionsManagementService = _sessionsManagementService;
    this._sessionsService = _sessionsService;
    this.customViewService = customViewService;
    this._sessionsListModelService = _sessionsListModelService;
    this._sessionGroupsService = _sessionGroupsService;
    this._sessionSectionOrderService = _sessionSectionOrderService;
    this._agentHostFilterService = _agentHostFilterService;
    this.contextKeyService = contextKeyService;
    this.storageService = storageService;
    this.contextMenuService = contextMenuService;
    this.menuService = menuService;
    this.keybindingService = keybindingService;
    this.commandService = commandService;
    this.automationService = automationService;
    this._listVoicePlaybackService = _listVoicePlaybackService;
    this.assignmentService = assignmentService;
    this.configurationService = configurationService;
    this.accessibilityService = accessibilityService;
    this.layoutService = layoutService;
    this.sessions = [];
    this.visible = true;
    /**
     * Maximum number of sessions shown per workspace section or user group.
     */
    this.sessionGroupLimit = observableValue(this, SessionsList.DEFAULT_SESSION_GROUP_LIMIT);
    this.expandedSessionGroups = /* @__PURE__ */ new Set();
    this.expandedMoreFolders = false;
    this.hasFindPattern = false;
    this.suspendCollapseStatePersistence = false;
    this._archiveActionsInProgress = /* @__PURE__ */ new Set();
    /**
     * Snapshot of the currently-rendered reorderable top-level headers (groups
     * and, in workspace mode, workspace sections) in display order, by reorder
     * identity. Captured each render and used as the basis for drag-reorder math.
     */
    this._topLevelOrder = [];
    this._onDidUpdate = this._register(new Emitter());
    this.onDidUpdate = this._onDidUpdate.event;
    this._onDidChangeFindOpenState = this._register(new Emitter());
    this.onDidChangeFindOpenState = this._onDidChangeFindOpenState.event;
    this.excludedSessionTypes = this.loadExcludedSessionTypes();
    this.excludedStatuses = this.loadExcludedStatuses();
    this._excludeArchived = this.storageService.getBoolean(SessionsList.EXCLUDE_ARCHIVED_KEY, StorageScope.PROFILE, true);
    this._excludeRead = this.storageService.getBoolean(SessionsList.EXCLUDE_READ_KEY, StorageScope.PROFILE, false);
    this.workspaceGroupCapped = this.storageService.getBoolean(SessionsList.WORKSPACE_GROUP_CAPPED_KEY, StorageScope.PROFILE, true);
    this.listContainer = DOM.append(container, $(".sessions-list-control"));
    this._register(DOM.addDisposableListener(this.listContainer, DOM.EventType.POINTER_DOWN, () => {
      this.listContainer.classList.add(SESSION_SECTION_FOCUS_FROM_POINTER_CLASS);
    }));
    this._register(DOM.addDisposableListener(this.listContainer.ownerDocument, DOM.EventType.KEY_DOWN, () => {
      this.listContainer.classList.remove(SESSION_SECTION_FOCUS_FROM_POINTER_CLASS);
    }, true));
    const approvalModel = this._register(instantiationService.createInstance(AgentSessionApprovalModel));
    const markdownRendererService = instantiationService.invokeFunction((accessor) => accessor.get(IMarkdownRendererService));
    const hoverService = instantiationService.invokeFunction((accessor) => accessor.get(IHoverService));
    const sessionsProvidersService = instantiationService.invokeFunction((accessor) => accessor.get(ISessionsProvidersService));
    this._sessionsProvidersService = sessionsProvidersService;
    const providerCapabilityListeners = this._register(new DisposableStore());
    const subscribeProviderCapabilities = () => {
      providerCapabilityListeners.clear();
      for (const provider of sessionsProvidersService.getProviders()) {
        if (provider.onDidChangeCapabilities) {
          providerCapabilityListeners.add(provider.onDidChangeCapabilities(() => this.update()));
        }
      }
    };
    subscribeProviderCapabilities();
    this._register(sessionsProvidersService.onDidChangeProviders(() => {
      subscribeProviderCapabilities();
      this.update();
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING)) {
        this.update();
      }
    }));
    const agentSessionsService = instantiationService.invokeFunction((accessor) => accessor.get(IAgentSessionsService));
    const voicePlaybackService = instantiationService.invokeFunction((accessor) => accessor.get(IVoicePlaybackService));
    const sessionRenderer = this._sessionRenderer = new SessionItemRenderer(
      {
        grouping: this.options.grouping,
        isPinned: (s) => this.isSessionPinned(s),
        isRead: (s) => s.isRead.get(),
        visibleSessions: this._sessionsService.visibleSessions,
        getMultiSelectedSessions: (s) => this.getMultiSelectedSessions(s),
        showHover: true,
        approvalRowMaxLines: DEFAULT_APPROVAL_ROW_MAX_LINES,
        toolbarMenuId: SessionItemToolbarMenuId,
        handleToolbarAction: (action, session) => this.handleToolbarAction(action, session),
        onDidRequestRename: (session) => {
          this.commandService.executeCommand(RENAME_SESSION_COMMAND_ID, session).catch(onUnexpectedError);
        }
      },
      approvalModel,
      void 0,
      instantiationService,
      contextKeyService,
      markdownRendererService,
      hoverService,
      sessionsProvidersService,
      agentSessionsService,
      voicePlaybackService
    );
    const showMoreRenderer = new SessionShowMoreRenderer();
    const placeholderRenderer = new SessionPlaceholderRenderer(hoverService);
    const sectionRenderer = new SessionSectionRenderer(true, instantiationService, contextKeyService, this.automationService, this._sessionsManagementService, this.customViewService);
    this._sectionRenderer = sectionRenderer;
    const groupRenderer = new SessionGroupRenderer({
      commitEdit: (group, name) => this.commitGroupEdit(group, name),
      cancelEdit: (group) => this.cancelGroupEdit(group)
    }, instantiationService, contextKeyService);
    this._groupRenderer = groupRenderer;
    const delegate = new SessionsTreeDelegate(approvalModel, () => !!IsPhoneLayoutContext.getValue(contextKeyService));
    this.tree = this._register(instantiationService.createInstance(
      WorkbenchObjectTree,
      "SessionsListTree",
      this.listContainer,
      delegate,
      [
        sessionRenderer,
        sectionRenderer,
        groupRenderer,
        showMoreRenderer,
        placeholderRenderer
      ],
      {
        accessibilityProvider: new SessionsAccessibilityProvider(sectionRenderer.automationStatus),
        dnd: this._register(new SessionsListDragAndDrop({
          isReorderable: (session) => this.isReorderable(session),
          isSessionPinned: (session) => this.isSessionPinned(session),
          canDropOn: (dragged, target) => this.canReorderOnto(dragged, target),
          reorder: (dragged, target, position) => this.reorderSessions(dragged, target, position),
          getGroupIdOfSession: (session) => this._sessionGroupsService.getGroupOfSession(session.sessionId),
          addSessionsToGroup: (sessions, groupId, target, position) => this.addSessionsToGroup(sessions, groupId, target, position),
          pinSessions: (sessions, target, position) => this.pinSessions(sessions, target, position),
          setDropTargetHeader: (header) => this.setDropTargetHeader(header),
          reorderSection: (draggedId, targetId, position, isWorkspace) => this.reorderSection(draggedId, targetId, position, isWorkspace)
        })),
        identityProvider: {
          getId: (element) => {
            if (isSessionGroupItem(element)) {
              return `group:${element.group.id}`;
            }
            if (isSessionSection(element)) {
              return `section:${element.id}`;
            }
            if (isSessionShowMore(element)) {
              return `show-more:${element.kind}:${element.mode}:${element.sectionId}`;
            }
            if (isSessionPlaceholder(element)) {
              return `placeholder:${element.sectionId}`;
            }
            return element.resource.toString();
          },
          getGroupId: (element) => {
            if (isSessionGroupItem(element)) {
              return NotSelectableGroupId;
            }
            if (isSessionSection(element)) {
              return NotSelectableGroupId;
            }
            if (isSessionShowMore(element)) {
              return NotSelectableGroupId;
            }
            if (isSessionPlaceholder(element)) {
              return NotSelectableGroupId;
            }
            return element.isArchived.get() ? 2 : 1;
          }
        },
        horizontalScrolling: false,
        multipleSelectionSupport: true,
        indent: 0,
        findWidgetEnabled: true,
        defaultFindMode: TreeFindMode.Filter,
        findWidgetContainer: this.options.findWidgetContainer,
        findWidgetStyles: {
          ...defaultFindWidgetStyles,
          toggleStyles: {
            ...defaultToggleStyles,
            inputActiveOptionBorder: "transparent"
          }
        },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (element) => {
            if (isSessionGroupItem(element)) {
              return element.group.name;
            }
            if (isSessionSection(element)) {
              return element.label;
            }
            if (isSessionShowMore(element)) {
              return element.sectionLabel;
            }
            if (isSessionPlaceholder(element)) {
              return element.label;
            }
            return element.title.get();
          }
        },
        overrideStyles: this.options.overrideStyles,
        renderIndentGuides: RenderIndentGuides.None,
        twistieAdditionalCssClass: () => "force-no-twistie"
      }
    ));
    this._register(this.tree.onDidOpen((e) => {
      const element = e.element;
      if (!element) {
        return;
      }
      if (isSessionShowMore(element)) {
        if (element.kind === "folders") {
          this.expandedMoreFolders = element.mode === "more";
        } else {
          if (element.mode === "more") {
            this.expandedSessionGroups.add(element.sectionId);
          } else {
            this.expandedSessionGroups.delete(element.sectionId);
          }
        }
        this.update();
        return;
      }
      if (isSessionPlaceholder(element)) {
        return;
      }
      if (isSessionSection(element) && element.id === AUTOMATIONS_SECTION_ID) {
        this.tree.setSelection([]);
        this.commandService.executeCommand("sessionsView.manageAutomations");
        return;
      }
      if (!isSessionSection(element) && !isSessionGroupItem(element)) {
        this.markRead(element);
        const isLeftClick = DOM.isMouseEvent(e.browserEvent) && e.browserEvent.button === 0;
        const preserveFocus = isLeftClick ? false : e.editorOptions.preserveFocus ?? false;
        this.options.onSessionOpen(element.resource, preserveFocus, e.sideBySide);
        if (this._listVoicePlaybackService.hasPendingResponse(element.resource)) {
          this.commandService.executeCommand("_chat.voice.activateSession", element.resource.toString());
        }
      }
    }));
    this._register(sessionRenderer.onDidChangeItemHeight((session) => {
      if (this.tree.hasElement(session)) {
        this.tree.updateElementHeight(session, delegate.getHeight(session));
      }
    }));
    const phoneKeys = /* @__PURE__ */ new Set([IsPhoneLayoutContext.key]);
    const automationKeys = /* @__PURE__ */ new Set([ChatAutomationsEnabledContext.key]);
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(automationKeys)) {
        this.update();
      }
      if (!e.affectsSome(phoneKeys)) {
        return;
      }
      for (const session of this.sessions) {
        if (this.tree.hasElement(session)) {
          this.tree.updateElementHeight(session, delegate.getHeight(session));
        }
      }
    }));
    this._register(this.tree.onContextMenu((e) => this.onContextMenu(e)));
    this._register(this.tree.onDidChangeCollapseState((e) => {
      const element = e.node.element;
      if (element && isSessionGroupItem(element)) {
        this._groupRenderer.updateCollapseState(element, e.node.collapsed);
        if (!this.suspendCollapseStatePersistence) {
          this.saveSectionCollapseState(`group:${element.group.id}`, e.node.collapsed);
        }
      } else if (element && isSessionSection(element)) {
        sectionRenderer.updateCollapseState(element, e.node.collapsed);
        if (!this.suspendCollapseStatePersistence) {
          this.saveSectionCollapseState(element.id, e.node.collapsed);
        }
      }
    }));
    let isFindOpen = false;
    let findPattern = "";
    const updateFindPatternState = () => {
      const hasFindPattern = isFindOpen && findPattern.length > 0;
      if (hasFindPattern !== this.hasFindPattern) {
        this.hasFindPattern = hasFindPattern;
        this.update();
      }
    };
    this._register(this.tree.onDidChangeFindOpenState((open) => {
      isFindOpen = open;
      this._onDidChangeFindOpenState.fire(open);
      updateFindPatternState();
    }));
    this._register(this.tree.onDidChangeFindPattern((pattern) => {
      findPattern = pattern;
      updateFindPatternState();
    }));
    this._register(this._sessionsManagementService.onDidChangeSessions((e) => {
      if (this.visible) {
        this.refresh();
      }
      if (e.removed.length > 0) {
        this._sessionSectionOrderService.retain(this.liveSectionOrderIds());
      }
    }));
    this._register(this._sessionsListModelService.onDidChange(() => {
      if (this.visible) {
        this.update();
      }
    }));
    this._register(this._sessionGroupsService.onDidChange((e) => {
      if (this.visible) {
        this.update();
      }
      if (e.groupsChanged) {
        this._sessionSectionOrderService.retain(this.liveSectionOrderIds());
      }
    }));
    this._register(this._sessionSectionOrderService.onDidChange(() => {
      if (this.visible) {
        this.update();
      }
    }));
    this._register(this._agentHostFilterService.onDidChange(() => {
      if (this.visible) {
        this.update();
      }
    }));
    this._register(autorun((reader) => {
      this._sessionsService.activeSession.read(reader);
      if (this.visible) {
        this.update();
      }
    }));
    const assignmentRefetchSignal = observableSignalFromEvent(this, this.assignmentService.onDidRefetchAssignments);
    this._register(autorun((reader) => {
      assignmentRefetchSignal.read(reader);
      this.updateSessionGroupLimit();
    }));
    this.refresh();
  }
  get element() {
    return this.listContainer;
  }
  /**
   * Fetches the session group limit treatment and updates the backing
   * observable. Invalid or unset treatments fall back to the default limit.
   */
  updateSessionGroupLimit() {
    this.assignmentService.getTreatment(SessionsList.SESSION_GROUP_LIMIT_TREATMENT).then((value) => {
      const limit = typeof value === "number" && Number.isInteger(value) && value > 0 ? value : SessionsList.DEFAULT_SESSION_GROUP_LIMIT;
      if (this.sessionGroupLimit.get() !== limit) {
        this.sessionGroupLimit.set(limit, void 0);
        if (this.visible) {
          this.update();
        }
      }
    });
  }
  refresh() {
    this.sessions = this._sessionsManagementService.getSessions();
    for (const session of this.sessions) {
      this._sessionsListModelService.migrateLegacyReadState(session);
    }
    this.update();
  }
  update(expandAll) {
    const activeSession = this._sessionsService.activeSession.get();
    let filtered = this.sessions;
    const hostFilter = this._agentHostFilterService.selectedProviderId;
    if (hostFilter !== void 0) {
      filtered = filtered.filter((s) => s.providerId === hostFilter);
    }
    if (this.excludedSessionTypes.size > 0) {
      filtered = filtered.filter((s) => !this.excludedSessionTypes.has(s.sessionType));
    }
    if (this.excludedStatuses.size > 0) {
      filtered = filtered.filter((s) => !this.excludedStatuses.has(s.status.get()));
    }
    if (this._excludeArchived) {
      filtered = filtered.filter((s) => !s.isArchived.get());
    }
    if (this._excludeRead) {
      filtered = filtered.filter((s) => !s.isRead.get());
    }
    if (activeSession && !filtered.some((s) => s.sessionId === activeSession.sessionId)) {
      const match = this.sessions.find((s) => s.sessionId === activeSession.sessionId);
      if (match) {
        filtered = [...filtered, match];
      }
    }
    const grouping = this.options.grouping();
    const sorting = this.options.sorting();
    const sortKeyForGrouping = (s, srt) => this._sessionsListModelService.getSortKey(s, sortingToMode(srt));
    const groupedMembers = /* @__PURE__ */ new Map();
    const groupedRegularIds = /* @__PURE__ */ new Set();
    for (const s of filtered) {
      if (s.isArchived.get() || this.isSessionPinned(s)) {
        continue;
      }
      const groupId = this._sessionGroupsService.getGroupOfSession(s.sessionId);
      if (groupId !== void 0 && this._sessionGroupsService.getGroup(groupId)) {
        let members = groupedMembers.get(groupId);
        if (!members) {
          members = [];
          groupedMembers.set(groupId, members);
        }
        members.push(s);
        groupedRegularIds.add(s.sessionId);
      }
    }
    const forSections = groupedRegularIds.size > 0 ? filtered.filter((s) => !groupedRegularIds.has(s.sessionId)) : filtered;
    const groupItemsById = /* @__PURE__ */ new Map();
    for (const group of this._sessionGroupsService.getGroups()) {
      const members = groupedMembers.get(group.id) ?? [];
      const sortedMembers = sortSessions(members, sorting, sortKeyForGrouping);
      groupItemsById.set(group.id, {
        group,
        sessions: sortedMembers,
        isEmpty: this._sessionGroupsService.getSessionIdsInGroup(group.id).length === 0,
        editing: group.id === this._editingGroupId
      });
    }
    const defaultGroupIds = [...groupItemsById.values()].sort((a, b) => b.group.createdAt - a.group.createdAt).map((item) => `group:${item.group.id}`);
    const sections = groupSessionsForList(forSections, grouping, sorting, (session) => this.isSessionPinned(session), (s, srt) => this._sessionsListModelService.getSortKey(s, sortingToMode(srt)));
    const hasRecentSessions = sections.some((s) => s.id === "recent" && s.sessions.length > 0);
    const showEmptyDefaultGroups = this.configurationService.getValue(SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING);
    if (showEmptyDefaultGroups && this._someProviderSupportsQuickChats() && !sections.some((s) => s.id === QUICK_CHATS_SECTION_ID)) {
      sections.push({ id: QUICK_CHATS_SECTION_ID, label: localize("chatsSection", "Chats"), sessions: [] });
    }
    const partitionFolders = grouping === "workspace" /* Workspace */ && !this.hasFindPattern && this.workspaceGroupCapped;
    const moreFolderSectionIds = /* @__PURE__ */ new Set();
    if (partitionFolders) {
      const workspaceSections = sections.filter((s) => s.id.startsWith("workspace:"));
      if (workspaceSections.length > 0) {
        const now = Date.now();
        const isRecent = (section) => section.sessions.some((s) => s.updatedAt.get().getTime() >= now - FOUR_DAYS_MS);
        const isOpenWindow = (section) => !!this.openWindowSourceFolder && section.sessions.some((s) => sessionMatchesFolder(s, this.openWindowSourceFolder));
        const meetsCriteria = (section) => isRecent(section) || isOpenWindow(section);
        let anyMeets = false;
        for (const section of workspaceSections) {
          if (meetsCriteria(section)) {
            anyMeets = true;
            break;
          }
        }
        let fallbackId;
        if (!anyMeets) {
          let bestTime = -Infinity;
          for (const section of workspaceSections) {
            for (const s of section.sessions) {
              const t = s.updatedAt.get().getTime();
              if (t > bestTime) {
                bestTime = t;
                fallbackId = section.id;
              }
            }
          }
        }
        for (const section of workspaceSections) {
          if (!meetsCriteria(section) && section.id !== fallbackId && !this._sessionSectionOrderService.isPromoted(section.id)) {
            moreFolderSectionIds.add(section.id);
          }
        }
      }
    }
    const children = [];
    const sessionGroupLimit = this.sessionGroupLimit.get();
    const toSessionChildren = (sessions) => sessions.map((session) => ({ element: session }));
    const renderSessionChildren = (sessions, sectionId, sectionLabel, enabled) => {
      const limited = limitSessionsForList(sessions, sessionGroupLimit, {
        enabled,
        expanded: this.expandedSessionGroups.has(sectionId),
        sectionId,
        sectionLabel
      });
      const children2 = toSessionChildren(limited.sessions);
      if (limited.showMore) {
        children2.push({ element: limited.showMore });
      }
      return children2;
    };
    const renderSection = (section) => {
      if (section.id === AUTOMATIONS_SECTION_ID) {
        return {
          element: section,
          children: [],
          collapsible: false
        };
      }
      const isWorkspaceGroup = grouping === "workspace" /* Workspace */ && section.id.startsWith("workspace:");
      const limitSessions = isWorkspaceGroup && !this.hasFindPattern && this.workspaceGroupCapped;
      let sectionChildren = renderSessionChildren(section.sessions, section.id, section.label, limitSessions);
      if (section.id === QUICK_CHATS_SECTION_ID && section.sessions.length === 0) {
        sectionChildren = [{ element: { placeholder: true, sectionId: section.id, label: localize("noChats", "No chats") } }];
      }
      let defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrExpanded;
      if (grouping === "date" /* Date */ && hasRecentSessions) {
        const olderSections = ["older", "archived"];
        if (olderSections.includes(section.id)) {
          defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
        }
      }
      if (section.id === "archived") {
        defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
      }
      if (section.id === "pinned" || section.id === QUICK_CHATS_SECTION_ID) {
        defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
      }
      return {
        element: section,
        collapsible: true,
        collapsed: this.getSavedCollapseState(section.id) ?? defaultCollapsed,
        children: sectionChildren
      };
    };
    const renderGroup = (groupItem) => {
      const sectionId = `group:${groupItem.group.id}`;
      const groupChildren = groupItem.sessions.length === 0 ? [{
        element: {
          placeholder: true,
          sectionId,
          label: localize("noSessionInGroup", "No session"),
          hover: localize("noSessionInGroupHover", "Use Add to Group from a session's context menu, or drag it into this group.")
        }
      }] : renderSessionChildren(groupItem.sessions, sectionId, groupItem.group.name, !this.hasFindPattern && this.workspaceGroupCapped);
      return {
        element: groupItem,
        collapsible: true,
        collapsed: this.getSavedCollapseState(sectionId) ?? ObjectTreeElementCollapseState.PreserveOrExpanded,
        children: groupChildren
      };
    };
    if (this.contextKeyService.getContextKeyValue(ChatAutomationsEnabledContext.key)) {
      children.push(renderSection({ id: AUTOMATIONS_SECTION_ID, label: localize("automations", "Automations"), sessions: [] }));
    }
    const pinnedSection = sections.find((s) => s.id === "pinned");
    if (pinnedSection) {
      children.push(renderSection(pinnedSection));
    }
    const quickChatsSection = sections.find((s) => s.id === QUICK_CHATS_SECTION_ID);
    if (quickChatsSection) {
      children.push(renderSection(quickChatsSection));
    }
    const renderGroupById = (id) => {
      const groupItem = groupItemsById.get(id.slice("group:".length));
      if (groupItem) {
        children.push(renderGroup(groupItem));
      }
    };
    if (grouping === "date" /* Date */) {
      const resolvedGroupIds = this._sessionSectionOrderService.resolveOrder(defaultGroupIds);
      this._topLevelOrder = resolvedGroupIds;
      for (const id of resolvedGroupIds) {
        renderGroupById(id);
      }
      for (const section of sections) {
        if (section.id === "pinned" || section.id === "archived" || section.id === QUICK_CHATS_SECTION_ID) {
          continue;
        }
        children.push(renderSection(section));
      }
      const archived = sections.find((s) => s.id === "archived");
      if (archived) {
        children.push(renderSection(archived));
      }
    } else {
      const workspaceSections = sections.filter((s) => s.id.startsWith("workspace:"));
      const sectionById = new Map(workspaceSections.map((s) => [s.id, s]));
      const primaryWorkspaceIds = workspaceSections.filter((s) => !moreFolderSectionIds.has(s.id)).map((s) => s.id);
      const defaultOrder = [...defaultGroupIds, ...primaryWorkspaceIds];
      const resolvedIds = this._sessionSectionOrderService.resolveOrder(defaultOrder);
      this._topLevelOrder = resolvedIds;
      for (const id of resolvedIds) {
        if (id.startsWith("group:")) {
          renderGroupById(id);
        } else {
          const section = sectionById.get(id);
          if (section) {
            children.push(renderSection(section));
          }
        }
      }
      const moreFolderSections = workspaceSections.filter((s) => moreFolderSectionIds.has(s.id));
      if (moreFolderSections.length > 0) {
        if (this.expandedMoreFolders) {
          for (const section of moreFolderSections) {
            children.push(renderSection(section));
          }
          children.push({
            element: { showMore: true, kind: "folders", mode: "less", sectionId: SHOW_MORE_FOLDERS_LABEL, sectionLabel: SHOW_MORE_FOLDERS_LABEL, remainingCount: 0 }
          });
        } else {
          children.push({
            element: { showMore: true, kind: "folders", mode: "more", sectionId: SHOW_MORE_FOLDERS_LABEL, sectionLabel: SHOW_MORE_FOLDERS_LABEL, remainingCount: moreFolderSections.length }
          });
        }
      }
      const archivedSection = sections.find((s) => s.id === "archived");
      if (archivedSection) {
        children.push(renderSection(archivedSection));
      }
    }
    this.tree.setChildren(null, children);
    this._onDidUpdate.fire();
  }
  getVisibleSessions() {
    const sessions = new Set(this.sessions);
    const visibleSessions = [];
    const collect = (node) => {
      if (!node.visible) {
        return;
      }
      if (node.element && sessions.has(node.element)) {
        visibleSessions.push(node.element);
      }
      if (node.collapsed) {
        return;
      }
      for (const child of node.children) {
        collect(child);
      }
    };
    const root = this.tree.getNode();
    for (const child of root.children) {
      collect(child);
    }
    return visibleSessions;
  }
  reveal(sessionResource) {
    const resourceStr = sessionResource.toString();
    for (const session of this.sessions) {
      if (session.resource.toString() === resourceStr) {
        if (this.tree.hasElement(session)) {
          if (this.tree.getRelativeTop(session) === null) {
            this.tree.reveal(session, 0.5);
          }
          this.tree.setFocus([session]);
          this.tree.setSelection([session]);
          return true;
        }
      }
    }
    return false;
  }
  clearFocus() {
    this.tree.setFocus([]);
    this.tree.setSelection([]);
  }
  hasFocusOrSelection() {
    return this.tree.getFocus().length > 0 || this.tree.getSelection().length > 0;
  }
  setVisible(visible) {
    if (this.visible === visible) {
      return;
    }
    this.visible = visible;
    if (this.visible) {
      this.refresh();
    }
  }
  layout(height, width) {
    this.tree.layout(height, width);
  }
  focus() {
    this.tree.domFocus();
    if (this.tree.getFocus().length === 0) {
      this.tree.focusFirst();
    }
  }
  openFind() {
    this.tree.openFind();
  }
  closeFind() {
    this.tree.closeFind();
  }
  // Context menu
  /**
   * Whether a session may participate in manual reordering. Archived (Done)
   * sessions keep their fixed section.
   */
  isReorderable(session) {
    return !session.isArchived.get();
  }
  /**
   * Whether the dragged sessions can be reordered relative to the target.
   * Reordering stays within the same scope: dragged sessions must share the
   * target's group membership, and (when grouping by workspace) its workspace.
   */
  canReorderOnto(dragged, target) {
    const targetPinned = this.isSessionPinned(target);
    if (dragged.some((s) => this.isSessionPinned(s) !== targetPinned)) {
      return false;
    }
    if (targetPinned) {
      return true;
    }
    const targetGroup = this._sessionGroupsService.getGroupOfSession(target.sessionId);
    if (dragged.some((s) => this._sessionGroupsService.getGroupOfSession(s.sessionId) !== targetGroup)) {
      return false;
    }
    if (targetGroup === void 0 && this.options.grouping() === "workspace" /* Workspace */) {
      const targetLabel = sessionWorkspaceLabel(target);
      return dragged.every((s) => sessionWorkspaceLabel(s) === targetLabel);
    }
    return true;
  }
  /**
   * Reorder the dragged sessions so they land as a contiguous block before or
   * after the target session, persisting a synthetic sort key (the midpoint of
   * the surrounding sessions' keys). When the dragged sessions' natural
   * timestamps already sort them into the dropped slot, any stored override is
   * dropped instead so the list falls back to natural ordering.
   */
  reorderSessions(dragged, target, position) {
    const mode = sortingToMode(this.options.sorting());
    const grouping = this.options.grouping();
    const getKey = (s) => this._sessionsListModelService.getSortKey(s, mode);
    const targetPinned = this.isSessionPinned(target);
    let scope = this.getVisibleSessions().filter((s) => this.isReorderable(s));
    scope = scope.filter((s) => this.isSessionPinned(s) === targetPinned);
    if (!targetPinned) {
      const targetGroup = this._sessionGroupsService.getGroupOfSession(target.sessionId);
      scope = scope.filter((s) => this._sessionGroupsService.getGroupOfSession(s.sessionId) === targetGroup);
      if (targetGroup === void 0 && grouping === "workspace" /* Workspace */) {
        const targetLabel = sessionWorkspaceLabel(target);
        scope = scope.filter((s) => sessionWorkspaceLabel(s) === targetLabel);
      }
    }
    const draggedIds = new Set(dragged.map((s) => s.sessionId));
    const draggedOrdered = scope.filter((s) => draggedIds.has(s.sessionId));
    if (draggedOrdered.length === 0) {
      return;
    }
    const remaining = scope.filter((s) => !draggedIds.has(s.sessionId));
    const targetIndex = remaining.findIndex((s) => s.sessionId === target.sessionId);
    if (targetIndex === -1) {
      return;
    }
    const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
    const above = remaining[insertIndex - 1];
    const below = remaining[insertIndex];
    const { set, clear } = computeReorderSortChanges({
      draggedIds: draggedOrdered.map((s) => s.sessionId),
      naturalKeys: draggedOrdered.map((s) => this._sessionsListModelService.getNaturalSortKey(s, mode)),
      aboveKey: above ? getKey(above) : void 0,
      belowKey: below ? getKey(below) : void 0,
      now: Date.now(),
      fallbackStep: SORT_FALLBACK_STEP_MS
    });
    this._sessionsListModelService.applySortChanges(mode, set, clear);
  }
  // -- Groups --
  /**
   * Create a new group containing the given sessions and start renaming it.
   * Archived (Done) sessions are ignored.
   */
  createGroupFromSessions(sessions) {
    const groupSessions = sessions.filter((session) => !session.isArchived.get());
    if (groupSessions.length === 0) {
      return;
    }
    this.createGroup(groupSessions);
  }
  createGroup(groupSessions) {
    this._sessionsListModelService.unpinSessions(groupSessions);
    const group = this._sessionGroupsService.createGroup(localize("newGroupName", "New Group"), groupSessions.map((s) => s.sessionId));
    this._editingGroupId = group.id;
    this.update();
    this.revealGroup(group.id);
  }
  /** Scroll the group's header into view so its inline name editor is visible. */
  revealGroup(groupId) {
    const root = this.tree.getNode();
    for (const node of root.children) {
      const element = node.element;
      if (element && isSessionGroupItem(element) && element.group.id === groupId) {
        if (this.tree.hasElement(element) && this.tree.getRelativeTop(element) === null) {
          this.tree.reveal(element, 0.5);
        }
        return;
      }
    }
  }
  /** Begin inline renaming of the group's header. */
  beginRenameGroup(groupId) {
    if (!this._sessionGroupsService.getGroup(groupId)) {
      return;
    }
    this._editingGroupId = groupId;
    this.update();
  }
  addSessionsToGroup(sessions, groupId, target, position) {
    const groupSessions = sessions.filter((session) => !session.isArchived.get());
    this._sessionsListModelService.unpinSessions(groupSessions);
    this._sessionGroupsService.addToGroup(groupSessions.map((s) => s.sessionId), groupId);
    if (target && position) {
      this.reorderSessions(groupSessions, target, position);
    }
  }
  commitGroupEdit(group, name) {
    this._editingGroupId = void 0;
    const trimmed = name.trim();
    if (trimmed) {
      this._sessionGroupsService.renameGroup(group.id, trimmed);
    }
    this.update();
  }
  cancelGroupEdit(_group) {
    this._editingGroupId = void 0;
    this.update();
  }
  /**
   * Reorder a top-level header (group or workspace section) so it lands
   * before/after the target header. The new order is persisted to the
   * section-order service. When the dragged header is a workspace it is also
   * promoted so it stays visible (escapes the "+N more workspaces" capping).
   */
  reorderSection(draggedId, targetId, position, isWorkspace) {
    this._sessionSectionOrderService.reorder(this._topLevelOrder, draggedId, targetId, position, isWorkspace ? draggedId : void 0);
  }
  /**
   * Groups in their current top-to-bottom display order. Groups are fully
   * user-managed (see {@link ISessionSectionOrderService}); the order defaults
   * to newest-first and is shared with the list. Used to keep the "Add to
   * Group" / "Move to Group" menu consistent with the rendered order.
   */
  getGroupsInDisplayOrder() {
    const groups = this._sessionGroupsService.getGroups();
    const byId = new Map(groups.map((g) => [`group:${g.id}`, g]));
    const defaultIds = [...groups].sort((a, b) => b.createdAt - a.createdAt).map((g) => `group:${g.id}`);
    return this._sessionSectionOrderService.resolveOrder(defaultIds).map((id) => byId.get(id)).filter((g) => !!g);
  }
  /**
   * The set of top-level reorder identities that currently exist (every group,
   * plus every workspace label present across all sessions, regardless of
   * grouping mode or capping). Used to garbage-collect stale manual order and
   * promotion entries. Reads sessions fresh from the management service so it
   * reflects the latest loaded state even when the list is not visible.
   */
  liveSectionOrderIds() {
    const ids = /* @__PURE__ */ new Set();
    for (const group of this._sessionGroupsService.getGroups()) {
      ids.add(`group:${group.id}`);
    }
    for (const session of this._sessionsManagementService.getSessions()) {
      ids.add(`workspace:${sessionWorkspaceLabel(session)}`);
    }
    return ids;
  }
  setDropTargetHeader(header) {
    const current = this._dropTargetHeader;
    if (current?.kind === header?.kind && current?.id === header?.id) {
      this.toggleDropTargetHeader(header, header !== void 0);
      return;
    }
    this.toggleDropTargetHeader(current, false);
    this._dropTargetHeader = header;
    this.toggleDropTargetHeader(header, true);
  }
  toggleDropTargetHeader(header, active) {
    if (!header) {
      return;
    }
    if (header.kind === "group") {
      this._groupRenderer.setDropTarget(header.id, active);
    } else {
      this._sectionRenderer.setDropTarget(header.id, active);
    }
  }
  getMultiSelectedSessions(session) {
    const selection = this.tree.getSelection().filter((s) => !!s && isSessionItem(s));
    return selection.includes(session) ? [session, ...selection.filter((s) => s !== session)] : [session];
  }
  async handleToolbarAction(action, session) {
    const sessions = this.getMultiSelectedSessions(session);
    if (!shouldAnimateArchiveAction(action.id, sessions.length, this.accessibilityService.isMotionReduced())) {
      return false;
    }
    const sessionResources = sessions.map((session2) => session2.resource.toString());
    if (sessionResources.some((resource) => this._archiveActionsInProgress.has(resource))) {
      return true;
    }
    const overlayHost = this.layoutService.getContainer(DOM.getWindow(this.listContainer));
    const animation = this._sessionRenderer.startArchiveAnimation(session, overlayHost);
    if (!animation) {
      return false;
    }
    for (const resource of sessionResources) {
      this._archiveActionsInProgress.add(resource);
    }
    try {
      await animation.finished;
      await action.run(sessions);
      return true;
    } finally {
      this._sessionRenderer.clearArchiveAnimation(session, animation);
      for (const resource of sessionResources) {
        this._archiveActionsInProgress.delete(resource);
      }
    }
  }
  onContextMenu(e) {
    const element = e.element;
    if (!element || isSessionSection(element) || isSessionShowMore(element) || isSessionPlaceholder(element)) {
      this.showCreateGroupContextMenu(e.anchor);
      return;
    }
    if (isSessionGroupItem(element)) {
      this.showGroupContextMenu(element, e.anchor);
      return;
    }
    const selectedSessions = this.getMultiSelectedSessions(element);
    const inGroup = this._sessionGroupsService.getGroupOfSession(element.sessionId) !== void 0;
    const contextOverlay = [
      [IsSessionPinnedContext.key, this.isSessionPinned(element)],
      [SessionIsArchivedContext.key, element.isArchived.get()],
      [SessionIsReadContext.key, element.isRead.get()],
      [SessionItemHasBranchNameContext.key, !!element.workspace.get()?.folders[0]?.gitRepository?.branchName?.trim()],
      [SessionItemInGroupContext.key, inGroup],
      [SessionTypeContext.key, element.sessionType],
      [SessionProviderIdContext.key, element.providerId],
      [SessionSupportsRenameContext.key, element.capabilities.get().supportsRename ?? false],
      [SessionSupportsDeleteContext.key, element.capabilities.get().supportsDelete ?? false],
      [SessionHasPullRequestContext.key, !!element.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get()?.pullRequest]
    ];
    const menu = this.menuService.createMenu(SessionItemContextMenuId, this.contextKeyService.createOverlay(contextOverlay));
    const marshalledArg = {
      $mid: MarshalledId.AgentSessionContext,
      session: { resource: element.resource },
      sessions: selectedSessions.map((s) => ({ resource: s.resource }))
    };
    const wrapForExtensions = (action) => {
      if (!(action instanceof MenuItemAction) || !action.item.source) {
        return action;
      }
      const wrapped = new Action(action.id, action.label, action.class, action.enabled, () => this.commandService.executeCommand(action.id, marshalledArg));
      wrapped.tooltip = action.tooltip;
      wrapped.checked = action.checked;
      return wrapped;
    };
    this.contextMenuService.showContextMenu({
      getActions: () => {
        const base = Separator.join(...menu.getActions({ arg: selectedSessions, shouldForwardArgs: true }).map(([, actions]) => actions.map(wrapForExtensions)));
        const groupActions = this.getGroupSessionActions(selectedSessions);
        return groupActions.length > 0 ? [...base, new Separator(), ...groupActions] : base;
      },
      getAnchor: () => e.anchor,
      getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id) ?? void 0
    });
    menu.dispose();
  }
  /**
   * Build the group-related context menu actions for the given session(s):
   * "Create Group", an "Add to Group"/"Move to Group" submenu listing the
   * groups in display order, and "Remove from Group" when applicable.
   */
  getGroupSessionActions(selected) {
    const actions = [];
    if (selected.some((session) => session.isArchived.get())) {
      return actions;
    }
    actions.push(this.getCreateGroupAction(selected));
    const currentGroupIds = new Set(selected.map((s) => this._sessionGroupsService.getGroupOfSession(s.sessionId)));
    const currentGroupId = currentGroupIds.size === 1 ? [...currentGroupIds][0] : void 0;
    const targetGroups = this.getGroupsInDisplayOrder().filter((g) => g.id !== currentGroupId);
    if (targetGroups.length > 0) {
      const subActions = targetGroups.map((g) => new Action(`sessions.addToGroup.${g.id}`, g.name, void 0, true, async () => {
        this.addSessionsToGroup(selected, g.id);
      }));
      const label = currentGroupId !== void 0 ? localize("moveToGroupAction", "Move to Group") : localize("addToGroupAction", "Add to Group");
      actions.push(new SubmenuAction("sessions.addToGroupSubmenu", label, subActions));
    }
    if (currentGroupId !== void 0) {
      actions.push(new Action("sessions.removeFromGroup", localize("removeFromGroupAction", "Remove from Group"), void 0, true, async () => {
        for (const session of selected) {
          this._sessionGroupsService.removeFromGroup(session.sessionId);
        }
      }));
    }
    return actions;
  }
  getCreateGroupAction(sessions) {
    return new Action("sessions.createGroup", localize("createGroupAction", "Create Group"), void 0, true, async () => {
      if (sessions) {
        this.createGroupFromSessions(sessions);
      } else {
        this.createGroup([]);
      }
    });
  }
  showCreateGroupContextMenu(anchor) {
    this.contextMenuService.showContextMenu({
      getActions: () => [this.getCreateGroupAction()],
      getAnchor: () => anchor
    });
  }
  showGroupContextMenu(groupItem, anchor) {
    const actions = [
      this.getCreateGroupAction(),
      new Separator(),
      new Action("sessions.renameGroupAction", localize("renameGroupAction", "Rename..."), void 0, true, async () => {
        this.beginRenameGroup(groupItem.group.id);
      }),
      new Action("sessions.deleteGroupAction", localize("deleteGroupAction", "Delete Group"), void 0, true, async () => {
        this._sessionGroupsService.deleteGroup(groupItem.group.id);
      })
    ];
    this.contextMenuService.showContextMenu({
      getActions: () => actions,
      getAnchor: () => anchor
    });
  }
  resetSectionCollapseState() {
    this.storageService.remove(SessionsList.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
  }
  // -- Pinning --
  pinSession(session) {
    this._sessionsListModelService.pinSession(session);
  }
  pinSessions(sessions, target, position) {
    const pinnable = sessions.filter((session) => !session.isArchived.get());
    for (const session of pinnable) {
      this._sessionsListModelService.pinSession(session);
    }
    if (target && position) {
      this.reorderSessions(pinnable, target, position);
    }
  }
  unpinSession(session) {
    this._sessionsListModelService.unpinSession(session);
  }
  isSessionPinned(session) {
    return this._sessionsListModelService.isSessionPinned(session);
  }
  /** Whether any registered provider can create quick chats (gates the always-visible "Chats" section). */
  _someProviderSupportsQuickChats() {
    return this._sessionsProvidersService.getProviders().some((p) => !!p.supportsQuickChats);
  }
  // -- Read/Unread --
  markRead(session) {
    this._sessionsManagementService.markRead(session);
  }
  markUnread(session) {
    this._sessionsManagementService.markUnread(session);
  }
  // -- Session type filtering --
  setSessionTypeExcluded(sessionTypeId, excluded) {
    if (excluded) {
      this.excludedSessionTypes.add(sessionTypeId);
    } else {
      this.excludedSessionTypes.delete(sessionTypeId);
    }
    this.saveExcludedSessionTypes();
    this.update();
  }
  isSessionTypeExcluded(sessionTypeId) {
    return this.excludedSessionTypes.has(sessionTypeId);
  }
  loadExcludedSessionTypes() {
    const raw = this.storageService.get(SessionsList.EXCLUDED_TYPES_KEY, StorageScope.PROFILE);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          return new Set(arr);
        }
      } catch {
      }
    }
    return /* @__PURE__ */ new Set();
  }
  saveExcludedSessionTypes() {
    if (this.excludedSessionTypes.size === 0) {
      this.storageService.remove(SessionsList.EXCLUDED_TYPES_KEY, StorageScope.PROFILE);
    } else {
      this.storageService.store(SessionsList.EXCLUDED_TYPES_KEY, JSON.stringify([...this.excludedSessionTypes]), StorageScope.PROFILE, StorageTarget.USER);
    }
  }
  // -- Status filtering --
  setStatusExcluded(status, excluded) {
    if (excluded) {
      this.excludedStatuses.add(status);
    } else {
      this.excludedStatuses.delete(status);
    }
    this.saveExcludedStatuses();
    this.update();
  }
  isStatusExcluded(status) {
    return this.excludedStatuses.has(status);
  }
  loadExcludedStatuses() {
    const raw = this.storageService.get(SessionsList.EXCLUDED_STATUSES_KEY, StorageScope.PROFILE);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          return new Set(arr);
        }
      } catch {
      }
    }
    return /* @__PURE__ */ new Set();
  }
  saveExcludedStatuses() {
    if (this.excludedStatuses.size === 0) {
      this.storageService.remove(SessionsList.EXCLUDED_STATUSES_KEY, StorageScope.PROFILE);
    } else {
      this.storageService.store(SessionsList.EXCLUDED_STATUSES_KEY, JSON.stringify([...this.excludedStatuses]), StorageScope.PROFILE, StorageTarget.USER);
    }
  }
  // -- Archived / Read filtering --
  setExcludeArchived(exclude) {
    this._excludeArchived = exclude;
    this.storageService.store(SessionsList.EXCLUDE_ARCHIVED_KEY, exclude, StorageScope.PROFILE, StorageTarget.USER);
    this.update();
  }
  isExcludeArchived() {
    return this._excludeArchived;
  }
  setExcludeRead(exclude) {
    this._excludeRead = exclude;
    this.storageService.store(SessionsList.EXCLUDE_READ_KEY, exclude, StorageScope.PROFILE, StorageTarget.USER);
    this.update();
  }
  isExcludeRead() {
    return this._excludeRead;
  }
  resetFilters() {
    this.excludedSessionTypes.clear();
    this.saveExcludedSessionTypes();
    this.excludedStatuses.clear();
    this.saveExcludedStatuses();
    this._excludeArchived = true;
    this.storageService.store(SessionsList.EXCLUDE_ARCHIVED_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
    this._excludeRead = false;
    this.storageService.store(SessionsList.EXCLUDE_READ_KEY, false, StorageScope.PROFILE, StorageTarget.USER);
    this.workspaceGroupCapped = true;
    this.storageService.store(SessionsList.WORKSPACE_GROUP_CAPPED_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
    this.expandedSessionGroups.clear();
    this.expandedMoreFolders = false;
    this.update();
  }
  // Session group capping
  setWorkspaceGroupCapped(capped) {
    this.workspaceGroupCapped = capped;
    this.storageService.store(SessionsList.WORKSPACE_GROUP_CAPPED_KEY, capped, StorageScope.PROFILE, StorageTarget.USER);
    if (capped) {
      this.expandedSessionGroups.clear();
    }
    this.update();
  }
  isWorkspaceGroupCapped() {
    return this.workspaceGroupCapped;
  }
  setOpenWindowSourceFolder(folder) {
    const before = this.openWindowSourceFolder?.toString();
    const after = folder?.toString();
    if (before === after) {
      return;
    }
    this.openWindowSourceFolder = folder;
    this.update();
  }
  collapseAllSections() {
    this.suspendCollapseStatePersistence = true;
    try {
      this.tree.collapseAll();
    } finally {
      this.suspendCollapseStatePersistence = false;
    }
    this.saveBulkCollapseState(true);
  }
  // -- Section collapse persistence --
  getSavedCollapseState(sectionId) {
    const raw = this.storageService.get(SessionsList.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
    if (raw) {
      try {
        const state = JSON.parse(raw);
        if (typeof state[sectionId] === "boolean") {
          return state[sectionId];
        }
      } catch {
      }
    }
    return void 0;
  }
  saveSectionCollapseState(sectionId, collapsed) {
    let state = {};
    const raw = this.storageService.get(SessionsList.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          state = parsed;
        }
      } catch {
      }
    }
    state[sectionId] = collapsed;
    this.storageService.store(SessionsList.SECTION_COLLAPSE_STATE_KEY, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.USER);
  }
  saveBulkCollapseState(collapsed) {
    const state = {};
    for (const child of this.tree.getNode(null).children) {
      if (child.element && isSessionSection(child.element)) {
        state[child.element.id] = collapsed;
      }
    }
    this.storageService.store(SessionsList.SECTION_COLLAPSE_STATE_KEY, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.USER);
  }
};
SessionsList.SECTION_COLLAPSE_STATE_KEY = "sessionsListControl.sectionCollapseState";
SessionsList.EXCLUDED_TYPES_KEY = "sessionsListControl.excludedSessionTypes";
SessionsList.EXCLUDED_STATUSES_KEY = "sessionsListControl.excludedStatuses";
SessionsList.EXCLUDE_ARCHIVED_KEY = "sessionsListControl.excludeArchived";
SessionsList.EXCLUDE_READ_KEY = "sessionsListControl.excludeRead";
SessionsList.WORKSPACE_GROUP_CAPPED_KEY = "sessionsListControl.workspaceGroupCapped";
SessionsList.DEFAULT_SESSION_GROUP_LIMIT = 5;
/**
 * Experiment treatment that overrides how many sessions are shown per group
 * before the "show more" affordance appears.
 */
SessionsList.SESSION_GROUP_LIMIT_TREATMENT = "sessions.workspaceGroupLimit";
SessionsList = __decorateClass([
  __decorateParam(2, ISessionsManagementService),
  __decorateParam(3, ISessionsService),
  __decorateParam(4, ICustomViewService),
  __decorateParam(5, ISessionsListModelService),
  __decorateParam(6, ISessionGroupsService),
  __decorateParam(7, ISessionSectionOrderService),
  __decorateParam(8, IAgentHostFilterService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IStorageService),
  __decorateParam(12, IContextMenuService),
  __decorateParam(13, IMenuService),
  __decorateParam(14, IKeybindingService),
  __decorateParam(15, ICommandService),
  __decorateParam(16, IAutomationService),
  __decorateParam(17, IVoicePlaybackService),
  __decorateParam(18, IWorkbenchAssignmentService),
  __decorateParam(19, IConfigurationService),
  __decorateParam(20, IAccessibilityService),
  __decorateParam(21, ILayoutService)
], SessionsList);
function getFirstApprovalAcrossChats(approvalModel, session, reader) {
  let oldest;
  for (const chat of session.chats.read(reader)) {
    const approval = approvalModel.getApproval(chat.resource).read(reader);
    if (approval && (!oldest || approval.since.getTime() < oldest.since.getTime())) {
      oldest = approval;
    }
  }
  return oldest;
}
function sessionMatchesFolder(session, folder) {
  const workspace = session.workspace.get();
  if (!workspace) {
    return false;
  }
  const folderStr = folder.toString();
  for (const folder2 of workspace.folders) {
    if (folder2.workingDirectory?.toString() === folderStr || folder2.root.toString() === folderStr) {
      return true;
    }
  }
  return false;
}
function sortSessions(sessions, sorting, getSortKey) {
  const key = getSortKey ?? defaultSortKey;
  return [...sessions].sort((a, b) => key(b, sorting) - key(a, sorting));
}
function limitSessionsForList(sessions, limit, options) {
  if (!options.enabled || sessions.length <= limit) {
    return { sessions, showMore: void 0 };
  }
  if (options.expanded) {
    return {
      sessions,
      showMore: {
        showMore: true,
        kind: "sessions",
        mode: "less",
        sectionId: options.sectionId,
        sectionLabel: options.sectionLabel,
        remainingCount: 0
      }
    };
  }
  return {
    sessions: sessions.slice(0, limit),
    showMore: {
      showMore: true,
      kind: "sessions",
      mode: "more",
      sectionId: options.sectionId,
      sectionLabel: options.sectionLabel,
      remainingCount: sessions.length - limit
    }
  };
}
function defaultSortKey(session, sorting) {
  if (sorting === "updated" /* Updated */) {
    return session.updatedAt.get().getTime();
  }
  return session.createdAt.getTime();
}
function computeReorderSortChanges(input) {
  const { draggedIds, naturalKeys, aboveKey, belowKey, now, fallbackStep } = input;
  const count = draggedIds.length;
  const upperFit = aboveKey ?? Number.POSITIVE_INFINITY;
  const lowerFit = belowKey ?? Number.NEGATIVE_INFINITY;
  let naturalFits = true;
  for (let i = 0; i < count; i++) {
    if (!(naturalKeys[i] < upperFit && naturalKeys[i] > lowerFit)) {
      naturalFits = false;
      break;
    }
    if (i > 0 && !(naturalKeys[i] < naturalKeys[i - 1])) {
      naturalFits = false;
      break;
    }
  }
  const set = /* @__PURE__ */ new Map();
  const clear = [];
  if (naturalFits) {
    for (const id of draggedIds) {
      clear.push(id);
    }
  } else {
    const upper = aboveKey ?? now;
    const lower = belowKey ?? upper - (count + 1) * fallbackStep;
    const step = (upper - lower) / (count + 1);
    for (let i = 0; i < count; i++) {
      set.set(draggedIds[i], upper - (i + 1) * step);
    }
  }
  return { set, clear };
}
const QUICK_CHATS_SECTION_ID = "quickchats";
function isQuickChatSession(session) {
  return session.isQuickChat?.get() ?? false;
}
function groupSessionsForList(sessions, grouping, sorting, isSessionPinned, getSortKey) {
  const sorted = sortSessions(sessions, sorting, getSortKey);
  const pinned = [];
  const archived = [];
  const quickChats = [];
  const regular = [];
  for (const session of sorted) {
    if (session.isArchived.get()) {
      archived.push(session);
    } else if (isSessionPinned(session)) {
      pinned.push(session);
    } else if (isQuickChatSession(session)) {
      quickChats.push(session);
    } else {
      regular.push(session);
    }
  }
  const sections = [];
  if (pinned.length > 0) {
    sections.push({ id: "pinned", label: localize("pinned", "Pinned"), sessions: pinned });
  }
  if (quickChats.length > 0) {
    sections.push({ id: QUICK_CHATS_SECTION_ID, label: localize("chatsSection", "Chats"), sessions: quickChats });
  }
  sections.push(...grouping === "workspace" /* Workspace */ ? groupByWorkspace(regular) : groupByDate(regular, sorting, getSortKey));
  if (archived.length > 0) {
    sections.push({ id: "archived", label: localize("archived", "Done"), sessions: archived });
  }
  return sections;
}
function sessionWorkspaceLabel(session) {
  return session.workspace.get()?.label || localize("unknown", "Unknown");
}
function groupByWorkspace(sessions) {
  const groups = /* @__PURE__ */ new Map();
  for (const session of sessions) {
    const label = sessionWorkspaceLabel(session);
    let group = groups.get(label);
    if (!group) {
      group = [];
      groups.set(label, group);
    }
    group.push(session);
  }
  const unknownWorkspaceLabel = localize("unknown", "Unknown");
  const order = [...groups.keys()].filter((k) => k !== unknownWorkspaceLabel).sort((a, b) => a.localeCompare(b));
  const result = order.map((label) => ({
    id: `workspace:${label}`,
    label,
    sessions: groups.get(label)
  }));
  const unknownWorkspace = groups.get(unknownWorkspaceLabel);
  if (unknownWorkspace) {
    result.push({ id: `workspace:${unknownWorkspaceLabel}`, label: unknownWorkspaceLabel, sessions: unknownWorkspace });
  }
  return result;
}
const RECENT_SESSIONS_LIMIT = 10;
function groupByDate(sessions, sorting, getSortKey) {
  const key = getSortKey ?? defaultSortKey;
  const now = /* @__PURE__ */ new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = startOfToday - 7 * 864e5;
  const recent = [];
  const older = [];
  for (const session of sessions) {
    const time = key(session, sorting);
    if (time >= startOfWeek && recent.length < RECENT_SESSIONS_LIMIT) {
      recent.push(session);
    } else {
      older.push(session);
    }
  }
  const sections = [];
  const addGroup = (id, label, groupSessions) => {
    if (groupSessions.length > 0) {
      sections.push({ id, label, sessions: groupSessions });
    }
  };
  addGroup("recent", localize("recent", "Recent"), recent);
  addGroup("older", localize("older", "Older"), older);
  return sections;
}
let SessionsFlatList = class extends Disposable {
  constructor(container, options, _sessionsService, _sessionsListModelService, _sessionsManagementService, instantiationService, contextKeyService, markdownRendererService, hoverService, sessionsProvidersService, voicePlaybackService) {
    super();
    this.options = options;
    this._sessionsService = _sessionsService;
    this._sessionsListModelService = _sessionsListModelService;
    this._sessionsManagementService = _sessionsManagementService;
    this._onDidChangeContentHeight = this._register(new Emitter());
    this.onDidChangeContentHeight = this._onDidChangeContentHeight.event;
    this._onDidApproveSession = this._register(new Emitter());
    /** Fires when a session's pending action is approved from its "Allow" button. */
    this.onDidApproveSession = this._onDidApproveSession.event;
    this._sessions = [];
    const listRoot = DOM.append(container, $(".sessions-list-control"));
    const approvalModel = this.options.approvalModel ?? this._register(instantiationService.createInstance(AgentSessionApprovalModel));
    const agentSessionsService = instantiationService.invokeFunction((accessor) => accessor.get(IAgentSessionsService));
    const sessionRenderer = new SessionItemRenderer(
      {
        grouping: () => "date" /* Date */,
        isPinned: (s) => this._sessionsListModelService.isSessionPinned(s),
        isRead: (s) => s.isRead.get(),
        visibleSessions: this._sessionsService.visibleSessions,
        getMultiSelectedSessions: (s) => [s],
        showHover: this.options.showSessionHover ?? true,
        approvalRowMaxLines: this.options.approvalRowMaxLines ?? DEFAULT_APPROVAL_ROW_MAX_LINES,
        toolbarMenuId: this.options.toolbarMenuId ?? SessionItemToolbarMenuId,
        handleToolbarAction: this.options.onToolbarAction
      },
      approvalModel,
      this.options.ciFixModel,
      instantiationService,
      contextKeyService,
      markdownRendererService,
      hoverService,
      sessionsProvidersService,
      agentSessionsService,
      voicePlaybackService
    );
    this._delegate = new SessionsTreeDelegate(approvalModel, () => false, this.options.approvalRowMaxLines ?? DEFAULT_APPROVAL_ROW_MAX_LINES, this.options.ciFixModel);
    this.tree = this._register(instantiationService.createInstance(
      WorkbenchObjectTree,
      "SessionsFlatList",
      listRoot,
      this._delegate,
      [sessionRenderer],
      {
        accessibilityProvider: new SessionsAccessibilityProvider(),
        identityProvider: {
          getId: (element) => element.resource.toString()
        },
        horizontalScrolling: false,
        multipleSelectionSupport: false,
        indent: 0,
        overrideStyles: this.options.overrideStyles,
        renderIndentGuides: RenderIndentGuides.None,
        twistieAdditionalCssClass: () => "force-no-twistie"
      }
    ));
    this._register(this.tree.onDidOpen((e) => {
      const element = e.element;
      if (!element || !isSessionItem(element)) {
        return;
      }
      this._sessionsManagementService.markRead(element);
      const isLeftClick = DOM.isMouseEvent(e.browserEvent) && e.browserEvent.button === 0;
      const preserveFocus = isLeftClick ? false : e.editorOptions.preserveFocus ?? false;
      this.options.onSessionOpen(element.resource, preserveFocus, e.sideBySide);
    }));
    this._register(sessionRenderer.onDidChangeItemHeight((session) => {
      if (this.tree.hasElement(session)) {
        this.tree.updateElementHeight(session, this._delegate.getHeight(session));
        this._onDidChangeContentHeight.fire();
      }
    }));
    this._register(sessionRenderer.onDidApproveSession((approved) => this._onDidApproveSession.fire(approved)));
  }
  setSessions(sessions) {
    this._sessions = sessions;
    this.tree.setChildren(null, sessions.map((session) => ({ element: session })));
  }
  /** The total pixel height required to render all current rows without scrolling. */
  getContentHeight() {
    return this._sessions.reduce((total, session) => total + this._delegate.getHeight(session), 0);
  }
  getRowHeight() {
    return SessionsFlatList.ROW_HEIGHT;
  }
  layout(height, width) {
    this.tree.layout(height, width);
  }
  focus() {
    this.tree.domFocus();
  }
};
SessionsFlatList.ROW_HEIGHT = 54;
SessionsFlatList = __decorateClass([
  __decorateParam(2, ISessionsService),
  __decorateParam(3, ISessionsListModelService),
  __decorateParam(4, ISessionsManagementService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IMarkdownRendererService),
  __decorateParam(8, IHoverService),
  __decorateParam(9, ISessionsProvidersService),
  __decorateParam(10, IVoicePlaybackService)
], SessionsFlatList);
export {
  IsSessionPinnedContext,
  QUICK_CHATS_SECTION_ID,
  SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING,
  SessionGroupHasVisibleSessionsContext,
  SessionGroupIsEmptyContext,
  SessionGroupToolbarMenuId,
  SessionItemContextMenuId,
  SessionItemHasBranchNameContext,
  SessionItemInGroupContext,
  SessionItemStatusContext,
  SessionItemToolbarMenuId,
  SessionSectionToolbarMenuId,
  SessionSectionTypeContext,
  SessionsFlatList,
  SessionsGrouping,
  SessionsList,
  SessionsSorting,
  computeReorderSortChanges,
  getFirstApprovalAcrossChats,
  groupByDate,
  groupByWorkspace,
  groupSessionsForList,
  isQuickChatSession,
  limitSessionsForList,
  shouldAnimateArchiveAction,
  sortSessions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvYnJvd3Nlci92aWV3cy9zZXNzaW9uc0xpc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4uL21lZGlhL3Nlc3Npb25zTGlzdC5jc3MnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcGF1c2VDU1NBbmltYXRpb25zV2hlbkhpZGRlbiwgc3luY2hyb25pemVDU1NBbmltYXRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2FuaW1hdGlvblN5bmMuanMnO1xuaW1wb3J0IHsgR2VzdHVyZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24sIExpc3REcmFnT3ZlckVmZmVjdFR5cGUsIE5vdFNlbGVjdGFibGVHcm91cElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJTGlzdFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSU9iamVjdFRyZWVFbGVtZW50LCBJVHJlZU5vZGUsIElUcmVlUmVuZGVyZXIsIElUcmVlQ29udGV4dE1lbnVFdmVudCwgT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLCBJVHJlZURyYWdBbmREcm9wLCBJVHJlZURyYWdPdmVyUmVhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IFJlbmRlckluZGVudEd1aWRlcywgVHJlZUZpbmRNb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYWJzdHJhY3RUcmVlLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEhpZ2hsaWdodGVkTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaGlnaGxpZ2h0ZWRsYWJlbC9oaWdobGlnaHRlZExhYmVsLmpzJztcbmltcG9ydCB7IGNyZWF0ZU1hdGNoZXMsIEZ1enp5U2NvcmUsIElNYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJUmVhZGVyLCBhdXRvcnVuLCBkZXJpdmVkLCBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZnJvbU5vdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgSU1lbnVTZXJ2aWNlLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblByb3ZpZGVySWRDb250ZXh0LCBTZXNzaW9uU3VwcG9ydHNEZWxldGVDb250ZXh0LCBTZXNzaW9uU3VwcG9ydHNSZW5hbWVDb250ZXh0LCBTZXNzaW9uVHlwZUNvbnRleHQsIElzUGhvbmVMYXlvdXRDb250ZXh0LCBTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQsIFNlc3Npb25Jc1JlYWRDb250ZXh0LCBTZXNzaW9uSGFzUHVsbFJlcXVlc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IEFSQ0hJVkVfU0VTU0lPTl9DT01NQU5EX0lELCBSRU5BTUVfU0VTU0lPTl9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25Db21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hPYmplY3RUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdHlsZU92ZXJyaWRlLCBkZWZhdWx0QnV0dG9uU3R5bGVzLCBkZWZhdWx0RmluZFdpZGdldFN0eWxlcywgZGVmYXVsdElucHV0Qm94U3R5bGVzLCBkZWZhdWx0VG9nZ2xlU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JVdGlscy5qcyc7XG5pbXBvcnQgeyBjaGFydHNPcmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JzL2NoYXJ0c0NvbG9ycy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRTZXNzaW9uV29ya3NwYWNlS2luZCwgR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRSwgSVNlc3Npb24sIElTZXNzaW9uV29ya3NwYWNlLCBTZXNzaW9uU3RhdHVzLCBTZXNzaW9uV29ya3NwYWNlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwsIGFnZW50U2Vzc2lvbkFwcHJvdmFsSWQsIElBZ2VudFNlc3Npb25BcHByb3ZhbEluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsLmpzJztcbmltcG9ydCB7IElWb2ljZVBsYXliYWNrU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3ZvaWNlUGxheWJhY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIEFjdGlvblJ1bm5lciwgSUFjdGlvbiwgU2VwYXJhdG9yLCBTdWJtZW51QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBIb3ZlclN0eWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zTGlzdE1vZGVsU2VydmljZSwgU2Vzc2lvblNvcnRNb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25Hcm91cCwgSVNlc3Npb25Hcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvblNlY3Rpb25PcmRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25TZWN0aW9uT3JkZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElucHV0Qm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9hc3NpZ25tZW50L2NvbW1vbi9hc3NpZ25tZW50U2VydmljZS5qcyc7XG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gVEVNUE9SQVJZICh0cmFja2VkIGJ5IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMjA0ODApXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gYElBZ2VudFNlc3Npb25zU2VydmljZWAgaXMgYSBDb3BpbG90LXByb3ZpZGVyIGludGVybmFsIGFuZCBtdXN0IG5vcm1hbGx5IG9ubHlcbi8vIGJlIGNvbnN1bWVkIGJ5IHRoZSBDb3BpbG90IGNoYXQgc2Vzc2lvbnMgcHJvdmlkZXIgXHUyMDE0IHRoZSByZXN0IG9mIHRoZSBBZ2VudHNcbi8vIHdpbmRvdyBzdGF5cyBwcm92aWRlci1hZ25vc3RpYyAoc2VlIFNFU1NJT05TLm1kKS4gVGhpcyBzaW5nbGUsIGRlbGliZXJhdGVcbi8vIGV4Y2VwdGlvbiBsZXRzIHRoZSBzZXNzaW9ucyBsaXN0IHRyaWdnZXIgbGF6eSByZXNvbHV0aW9uIG9mIGV4cGVuc2l2ZSBzZXNzaW9uXG4vLyBwcm9wZXJ0aWVzIChlLmcuIGNoYW5nZXMpIGZvciByb3dzIHRoYXQgc2Nyb2xsIGludG8gdmlldywgdW50aWwgRG9uXG4vLyByZS1pbXBsZW1lbnRzIGl0IHRoZSByaWdodCB3YXkgKGRyaXZlbiBmcm9tIGluc2lkZSB0aGUgQ29waWxvdCBwcm92aWRlciwgb3Jcbi8vIHZpYSBhIHByb3ZpZGVyLWFnbm9zdGljIHZpc2liaWxpdHkgc2lnbmFsIG9uIHRoZSBzaGFyZWQgc2VydmljZXMpLlxuLy8gRE8gTk9UIGFkZCBmdXJ0aGVyIHVzYWdlcyBvZiB0aGlzIGltcG9ydCBpbiB0aGUgc2Vzc2lvbnMgd29ya2JlbmNoLCBhbmQgRE8gTk9UXG4vLyBjb3B5IHRoaXMgc3VwcHJlc3Npb24gZWxzZXdoZXJlLlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLWltcG9ydHNcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvYWdlbnRIb3N0RmlsdGVyL2NvbW1vbi9hZ2VudEhvc3RGaWx0ZXIuanMnO1xuaW1wb3J0IHsgTG9jYWxTZWxlY3Rpb25UcmFuc2ZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RuZC9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBEcmFnZ2VkU2Vzc2lvbklkZW50aWZpZXIsIFNlc3Npb25zRGF0YVRyYW5zZmVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IElEcmFnQW5kRHJvcERhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhLCBMaXN0Vmlld1RhcmdldFNlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RWaWV3LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWlsZFNlc3Npb25Ib3ZlckNvbnRlbnQgfSBmcm9tICcuLi9zZXNzaW9uSG92ZXJDb250ZW50LmpzJztcbmltcG9ydCB7IFNlc3Npb25TdGF0dXNJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9zZXNzaW9uU3RhdHVzSWNvbi5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTZXNzaW9uQXJjaGl2ZUFuaW1hdGlvbiwgdHlwZSBJU2Vzc2lvbkFyY2hpdmVBbmltYXRpb24gfSBmcm9tICcuL3Nlc3Npb25BcmNoaXZlQW5pbWF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRBdXRvbWF0aW9uc0VuYWJsZWRDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbnNFbmFibGVkLmpzJztcbmltcG9ydCB7IElBdXRvbWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDdXN0b21WaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2N1c3RvbVZpZXcvYnJvd3Nlci9jdXN0b21WaWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBVVRPTUFUSU9OU19DVVNUT01fVklFV19JRCB9IGZyb20gJy4vYXV0b21hdGlvbnNWaWV3LmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5jb25zdCBBVVRPTUFUSU9OU19TRUNUSU9OX0lEID0gJ2F1dG9tYXRpb25zJztcbmNvbnN0IFNFU1NJT05fU0VDVElPTl9GT0NVU19GUk9NX1BPSU5URVJfQ0xBU1MgPSAnc2Vzc2lvbi1zZWN0aW9uLWZvY3VzLWZyb20tcG9pbnRlcic7XG5jb25zdCBTRVNTSU9OX0hFQURFUl9EUk9QX1RBUkdFVF9DTEFTUyA9ICdzZXNzaW9uLWhlYWRlci1kcm9wLXRhcmdldCc7XG5cbmV4cG9ydCBjb25zdCBTZXNzaW9uSXRlbVRvb2xiYXJNZW51SWQgPSBuZXcgTWVudUlkKCdTZXNzaW9uSXRlbVRvb2xiYXInKTtcbmV4cG9ydCBjb25zdCBTZXNzaW9uSXRlbUNvbnRleHRNZW51SWQgPSBNZW51SWQuU2Vzc2lvbkl0ZW1Db250ZXh0TWVudTtcbmV4cG9ydCBjb25zdCBTZXNzaW9uU2VjdGlvblRvb2xiYXJNZW51SWQgPSBuZXcgTWVudUlkKCdTZXNzaW9uU2VjdGlvblRvb2xiYXInKTtcbmV4cG9ydCBjb25zdCBTZXNzaW9uR3JvdXBUb29sYmFyTWVudUlkID0gbmV3IE1lbnVJZCgnU2Vzc2lvbkdyb3VwVG9vbGJhcicpO1xuXG4vKiogQ29udHJvbHMgd2hldGhlciB0aGUgZW1wdHkgZGVmYXVsdCBDaGF0cyBncm91cCBpcyBzaG93biBpbiB0aGUgc2Vzc2lvbnMgbGlzdC4gKi9cbmV4cG9ydCBjb25zdCBTRVNTSU9OU19MSVNUX1NIT1dfRU1QVFlfREVGQVVMVF9HUk9VUFNfU0VUVElORyA9ICdzZXNzaW9ucy5saXN0LnNob3dFbXB0eURlZmF1bHRHcm91cHMnO1xuXG5leHBvcnQgY29uc3QgSXNTZXNzaW9uUGlubmVkQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzZXNzaW9uSXRlbS5pc1Bpbm5lZCcsIGZhbHNlKTtcbmV4cG9ydCBjb25zdCBTZXNzaW9uSXRlbUhhc0JyYW5jaE5hbWVDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3Nlc3Npb25JdGVtLmhhc0JyYW5jaE5hbWUnLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgU2Vzc2lvbkl0ZW1TdGF0dXNDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8U2Vzc2lvblN0YXR1cz4oJ3Nlc3Npb25JdGVtLnN0YXR1cycsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKTtcbi8qKiBXaGV0aGVyIHRoZSBmb2N1c2VkIHNlc3Npb24gaXRlbSBjdXJyZW50bHkgYmVsb25ncyB0byBhIHVzZXIgZ3JvdXAuICovXG5leHBvcnQgY29uc3QgU2Vzc2lvbkl0ZW1Jbkdyb3VwQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzZXNzaW9uSXRlbS5pbkdyb3VwJywgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IFNlc3Npb25TZWN0aW9uVHlwZUNvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmc+KCdzZXNzaW9uU2VjdGlvbi50eXBlJywgJycpO1xuZXhwb3J0IGNvbnN0IFNlc3Npb25Hcm91cEhhc1Zpc2libGVTZXNzaW9uc0NvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2Vzc2lvbkdyb3VwLmhhc1Zpc2libGVTZXNzaW9ucycsIGZhbHNlKTtcbmV4cG9ydCBjb25zdCBTZXNzaW9uR3JvdXBJc0VtcHR5Q29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzZXNzaW9uR3JvdXAuaXNFbXB0eScsIGZhbHNlKTtcblxuLyoqIFdoZXRoZXIgYW4gaW5saW5lIGFyY2hpdmUgYWN0aW9uIHNob3VsZCBhbmltYXRlIGluc3RlYWQgb2YgcnVubmluZyBpbW1lZGlhdGVseS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRBbmltYXRlQXJjaGl2ZUFjdGlvbihhY3Rpb25JZDogc3RyaW5nLCBzZXNzaW9uQ291bnQ6IG51bWJlciwgbW90aW9uUmVkdWNlZDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gYWN0aW9uSWQgPT09IEFSQ0hJVkVfU0VTU0lPTl9DT01NQU5EX0lEICYmIHNlc3Npb25Db3VudCA9PT0gMSAmJiAhbW90aW9uUmVkdWNlZDtcbn1cblxuLy8jcmVnaW9uIFR5cGVzXG5cbmV4cG9ydCBlbnVtIFNlc3Npb25zR3JvdXBpbmcge1xuXHRXb3Jrc3BhY2UgPSAnd29ya3NwYWNlJyxcblx0RGF0ZSA9ICdkYXRlJyxcbn1cblxuZXhwb3J0IGVudW0gU2Vzc2lvbnNTb3J0aW5nIHtcblx0Q3JlYXRlZCA9ICdjcmVhdGVkJyxcblx0VXBkYXRlZCA9ICd1cGRhdGVkJyxcbn1cblxuZnVuY3Rpb24gc29ydGluZ1RvTW9kZShzb3J0aW5nOiBTZXNzaW9uc1NvcnRpbmcpOiBTZXNzaW9uU29ydE1vZGUge1xuXHRyZXR1cm4gc29ydGluZyA9PT0gU2Vzc2lvbnNTb3J0aW5nLlVwZGF0ZWQgPyAndXBkYXRlZCcgOiAnY3JlYXRlZCc7XG59XG5cbi8qKiBGYWxsYmFjayBzcGFjaW5nIChtcykgdXNlZCB3aGVuIGFzc2lnbmluZyBzeW50aGV0aWMgc29ydCBrZXlzIHBhc3QgYW4gb3BlbiBib3VuZGFyeS4gKi9cbmNvbnN0IFNPUlRfRkFMTEJBQ0tfU1RFUF9NUyA9IDYwXzAwMDtcblxuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvblNlY3Rpb24ge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uczogSVNlc3Npb25bXTtcbn1cblxuLyoqXG4gKiBBIHVzZXItY3JlYXRlZCBncm91cCByZW5kZXJlZCBhcyBhIHNlY3Rpb24tbGlrZSBoZWFkZXIuIENhcnJpZXMgdGhlIGJhY2tpbmdcbiAqIHtAbGluayBJU2Vzc2lvbkdyb3VwfSBwbHVzIGl0cyBjdXJyZW50bHktdmlzaWJsZSBtZW1iZXIgc2Vzc2lvbnMgYW5kIHdoZXRoZXJcbiAqIHRoZSBoZWFkZXIgc2hvdWxkIHJlbmRlciBpdHMgaW5saW5lIG5hbWUgZWRpdG9yLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uR3JvdXBJdGVtIHtcblx0cmVhZG9ubHkgZ3JvdXA6IElTZXNzaW9uR3JvdXA7XG5cdHJlYWRvbmx5IHNlc3Npb25zOiBJU2Vzc2lvbltdO1xuXHRyZWFkb25seSBpc0VtcHR5OiBib29sZWFuO1xuXHRyZWFkb25seSBlZGl0aW5nOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uU2hvd01vcmUge1xuXHRyZWFkb25seSBzaG93TW9yZTogdHJ1ZTtcblx0cmVhZG9ubHkga2luZDogJ3Nlc3Npb25zJyB8ICdmb2xkZXJzJztcblx0cmVhZG9ubHkgbW9kZTogJ21vcmUnIHwgJ2xlc3MnO1xuXHRyZWFkb25seSBzZWN0aW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2VjdGlvbkxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlbWFpbmluZ0NvdW50OiBudW1iZXI7XG59XG5cbi8qKiBTeW50aGV0aWMgbXV0ZWQgcm93IHNob3duIHdoZW4gYSBzZWN0aW9uIGlzIGVtcHR5LiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvblBsYWNlaG9sZGVyIHtcblx0cmVhZG9ubHkgcGxhY2Vob2xkZXI6IHRydWU7XG5cdHJlYWRvbmx5IHNlY3Rpb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBob3Zlcj86IHN0cmluZztcbn1cblxuZXhwb3J0IHR5cGUgU2Vzc2lvbkxpc3RJdGVtID0gSVNlc3Npb24gfCBJU2Vzc2lvblNlY3Rpb24gfCBJU2Vzc2lvbkdyb3VwSXRlbSB8IElTZXNzaW9uU2hvd01vcmUgfCBJU2Vzc2lvblBsYWNlaG9sZGVyO1xuXG5mdW5jdGlvbiBpc1Nlc3Npb25Hcm91cEl0ZW0oaXRlbTogU2Vzc2lvbkxpc3RJdGVtKTogaXRlbSBpcyBJU2Vzc2lvbkdyb3VwSXRlbSB7XG5cdHJldHVybiAnZ3JvdXAnIGluIGl0ZW07XG59XG5cbmZ1bmN0aW9uIGlzU2Vzc2lvblNlY3Rpb24oaXRlbTogU2Vzc2lvbkxpc3RJdGVtKTogaXRlbSBpcyBJU2Vzc2lvblNlY3Rpb24ge1xuXHRyZXR1cm4gIWlzU2Vzc2lvbkdyb3VwSXRlbShpdGVtKSAmJiAnc2Vzc2lvbnMnIGluIGl0ZW0gJiYgQXJyYXkuaXNBcnJheSgoaXRlbSBhcyBJU2Vzc2lvblNlY3Rpb24pLnNlc3Npb25zKTtcbn1cblxuZnVuY3Rpb24gaXNTZXNzaW9uU2hvd01vcmUoaXRlbTogU2Vzc2lvbkxpc3RJdGVtKTogaXRlbSBpcyBJU2Vzc2lvblNob3dNb3JlIHtcblx0cmV0dXJuICdzaG93TW9yZScgaW4gaXRlbSAmJiAoaXRlbSBhcyBJU2Vzc2lvblNob3dNb3JlKS5zaG93TW9yZSA9PT0gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaXNTZXNzaW9uUGxhY2Vob2xkZXIoaXRlbTogU2Vzc2lvbkxpc3RJdGVtKTogaXRlbSBpcyBJU2Vzc2lvblBsYWNlaG9sZGVyIHtcblx0cmV0dXJuICdwbGFjZWhvbGRlcicgaW4gaXRlbSAmJiAoaXRlbSBhcyBJU2Vzc2lvblBsYWNlaG9sZGVyKS5wbGFjZWhvbGRlciA9PT0gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaXNTZXNzaW9uSXRlbShpdGVtOiBTZXNzaW9uTGlzdEl0ZW0pOiBpdGVtIGlzIElTZXNzaW9uIHtcblx0cmV0dXJuICFpc1Nlc3Npb25Hcm91cEl0ZW0oaXRlbSkgJiYgIWlzU2Vzc2lvblNlY3Rpb24oaXRlbSkgJiYgIWlzU2Vzc2lvblNob3dNb3JlKGl0ZW0pICYmICFpc1Nlc3Npb25QbGFjZWhvbGRlcihpdGVtKTtcbn1cblxuY29uc3QgU0hPV19NT1JFX0ZPTERFUlNfTEFCRUwgPSAnX19tb3JlX2ZvbGRlcnNfXyc7XG5jb25zdCBGT1VSX0RBWVNfTVMgPSA0ICogMjQgKiA2MCAqIDYwICogMTAwMDtcblxuLyoqXG4gKiBEZWZhdWx0IG51bWJlciBvZiB0ZXJtaW5hbC1jb21tYW5kIGxpbmVzIHNob3duIGluIGEgc2Vzc2lvbiByb3cncyBhcHByb3ZhbFxuICogcHJvbXB0LiBUaGUgYmxvY2tlZC1zZXNzaW9ucyBkcm9wZG93biBvdmVycmlkZXMgdGhpcyB0byBzaG93IG1vcmUgbGluZXMuXG4gKi9cbmNvbnN0IERFRkFVTFRfQVBQUk9WQUxfUk9XX01BWF9MSU5FUyA9IDM7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gVHJlZSBEZWxlZ2F0ZVxuXG5jbGFzcyBTZXNzaW9uc1RyZWVEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPFNlc3Npb25MaXN0SXRlbT4ge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBJVEVNX0hFSUdIVCA9IDU0O1xuXHQvKiogUXVpY2stY2hhdCByb3dzIGFyZSBzaW5nbGUtbGluZSBcdTIwMTQgc2VlIHRoZSBgLnNlc3Npb24taXRlbS5xdWljay1jaGF0YCBydWxlcyBpbiBgc2Vzc2lvbnNMaXN0LmNzc2AuICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IElURU1fSEVJR0hUX1FVSUNLX0NIQVQgPSAyODtcblx0LyoqXG5cdCAqIFBob25lIGxheW91dCB1c2VzIGEgdGFsbGVyIHJvdyBzbyB0aGUgaW5saW5lIGFjdGlvbiB0b29sYmFyIGNhblxuXHQgKiBtZWV0IHRoZSA0NHB4IG1pbmltdW0gdG91Y2ggdGFyZ2V0IHdpdGhvdXQgb3ZlcmZsb3dpbmcuIFNpemVkIHRvXG5cdCAqIGZpdCBhIDQ0cHggdG9vbGJhciBjZW50ZXJlZCBiZXR3ZWVuIHRoZSB0aXRsZSBhbmQgZGV0YWlscyByb3dzLlxuXHQgKiBLZWVwIGluIHN5bmMgd2l0aCB0aGUgYC5waG9uZS1sYXlvdXQgLnNlc3Npb24taXRlbWAgcnVsZXMgaW5cblx0ICogYHNlc3Npb25zTGlzdC5jc3NgLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSVRFTV9IRUlHSFRfUEhPTkUgPSA3Njtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VDVElPTl9IRUlHSFQgPSAyNjtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0hPV19NT1JFX0hFSUdIVCA9IDI2O1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBQTEFDRUhPTERFUl9IRUlHSFQgPSAyNjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hcHByb3ZhbE1vZGVsOiBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2lzUGhvbmU6ICgpID0+IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYXBwcm92YWxSb3dNYXhMaW5lczogbnVtYmVyID0gREVGQVVMVF9BUFBST1ZBTF9ST1dfTUFYX0xJTkVTLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NpRml4TW9kZWw6IElTZXNzaW9uQ0lGaXhNb2RlbCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCxcblx0KSB7IH1cblxuXHRnZXRIZWlnaHQoZWxlbWVudDogU2Vzc2lvbkxpc3RJdGVtKTogbnVtYmVyIHtcblx0XHRpZiAoaXNTZXNzaW9uU2VjdGlvbihlbGVtZW50KSB8fCBpc1Nlc3Npb25Hcm91cEl0ZW0oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBTZXNzaW9uc1RyZWVEZWxlZ2F0ZS5TRUNUSU9OX0hFSUdIVDtcblx0XHR9XG5cdFx0aWYgKGlzU2Vzc2lvblNob3dNb3JlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gU2Vzc2lvbnNUcmVlRGVsZWdhdGUuU0hPV19NT1JFX0hFSUdIVDtcblx0XHR9XG5cdFx0aWYgKGlzU2Vzc2lvblBsYWNlaG9sZGVyKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gU2Vzc2lvbnNUcmVlRGVsZWdhdGUuUExBQ0VIT0xERVJfSEVJR0hUO1xuXHRcdH1cblxuXHRcdGxldCBoZWlnaHQ6IG51bWJlcjtcblx0XHRpZiAodGhpcy5faXNQaG9uZSgpKSB7XG5cdFx0XHRoZWlnaHQgPSBTZXNzaW9uc1RyZWVEZWxlZ2F0ZS5JVEVNX0hFSUdIVF9QSE9ORTtcblx0XHR9IGVsc2UgaWYgKGlzUXVpY2tDaGF0U2Vzc2lvbihlbGVtZW50IGFzIElTZXNzaW9uKSkge1xuXHRcdFx0aGVpZ2h0ID0gU2Vzc2lvbnNUcmVlRGVsZWdhdGUuSVRFTV9IRUlHSFRfUVVJQ0tfQ0hBVDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aGVpZ2h0ID0gU2Vzc2lvbnNUcmVlRGVsZWdhdGUuSVRFTV9IRUlHSFQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9hcHByb3ZhbE1vZGVsKSB7XG5cdFx0XHRjb25zdCBhcHByb3ZhbCA9IGdldEZpcnN0QXBwcm92YWxBY3Jvc3NDaGF0cyh0aGlzLl9hcHByb3ZhbE1vZGVsLCBlbGVtZW50IGFzIElTZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKGFwcHJvdmFsKSB7XG5cdFx0XHRcdGhlaWdodCArPSBTZXNzaW9uSXRlbVJlbmRlcmVyLmdldEFwcHJvdmFsUm93SGVpZ2h0KGFwcHJvdmFsLmxhYmVsLCB0aGlzLl9hcHByb3ZhbFJvd01heExpbmVzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NpRml4TW9kZWwgJiYgdGhpcy5fY2lGaXhNb2RlbC5nZXRDSUZpeChlbGVtZW50IGFzIElTZXNzaW9uKS5nZXQoKSkge1xuXHRcdFx0aGVpZ2h0ICs9IFNlc3Npb25JdGVtUmVuZGVyZXIuQ0lfUk9XX0hFSUdIVDtcblx0XHR9XG5cdFx0cmV0dXJuIGhlaWdodDtcblx0fVxuXG5cdGhhc0R5bmFtaWNIZWlnaHQoZWxlbWVudDogU2Vzc2lvbkxpc3RJdGVtKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICghIXRoaXMuX2FwcHJvdmFsTW9kZWwgfHwgISF0aGlzLl9jaUZpeE1vZGVsKSAmJiBpc1Nlc3Npb25JdGVtKGVsZW1lbnQpO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBTZXNzaW9uTGlzdEl0ZW0pOiBzdHJpbmcge1xuXHRcdGlmIChpc1Nlc3Npb25Hcm91cEl0ZW0oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBTZXNzaW9uR3JvdXBSZW5kZXJlci5URU1QTEFURV9JRDtcblx0XHR9XG5cdFx0aWYgKGlzU2Vzc2lvblNlY3Rpb24oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBTZXNzaW9uU2VjdGlvblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH1cblx0XHRpZiAoaXNTZXNzaW9uU2hvd01vcmUoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBTZXNzaW9uU2hvd01vcmVSZW5kZXJlci5URU1QTEFURV9JRDtcblx0XHR9XG5cdFx0aWYgKGlzU2Vzc2lvblBsYWNlaG9sZGVyKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gU2Vzc2lvblBsYWNlaG9sZGVyUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fVxuXHRcdHJldHVybiBTZXNzaW9uSXRlbVJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gU2Vzc2lvbiBJdGVtIFJlbmRlcmVyXG5cbi8qKlxuICogUmVzb2x2ZXMgaW5saW5lIHRvb2xiYXIgYWN0aW9ucyBhZ2FpbnN0IGVpdGhlciBhIGZvY3VzZWQtbGlzdCBoYW5kbGVyIG9yIHRoZVxuICogY3VycmVudCBtdWx0aS1zZWxlY3Rpb24uXG4gKi9cbmNsYXNzIFNlc3Npb25JdGVtQWN0aW9uUnVubmVyIGV4dGVuZHMgQWN0aW9uUnVubmVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGdldE11bHRpU2VsZWN0ZWRTZXNzaW9uczogKHNlc3Npb246IElTZXNzaW9uKSA9PiBJU2Vzc2lvbltdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaGFuZGxlQWN0aW9uPzogKGFjdGlvbjogSUFjdGlvbiwgc2Vzc2lvbjogSVNlc3Npb24pID0+IGJvb2xlYW4gfCBQcm9taXNlPGJvb2xlYW4+LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIHJ1bkFjdGlvbihhY3Rpb246IElBY3Rpb24sIGNvbnRleHQ/OiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGNvbnRleHQgJiYgIUFycmF5LmlzQXJyYXkoY29udGV4dCkpIHtcblx0XHRcdGlmICh0aGlzLmhhbmRsZUFjdGlvbiAmJiBhd2FpdCB0aGlzLmhhbmRsZUFjdGlvbihhY3Rpb24sIGNvbnRleHQgYXMgSVNlc3Npb24pKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHN1cGVyLnJ1bkFjdGlvbihhY3Rpb24sIHRoaXMuZ2V0TXVsdGlTZWxlY3RlZFNlc3Npb25zKGNvbnRleHQgYXMgSVNlc3Npb24pKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgc3VwZXIucnVuQWN0aW9uKGFjdGlvbiwgY29udGV4dCk7XG5cdH1cbn1cblxuLy8gS2V5ZnJhbWVzIG5hbWUgb2YgdGhlIGluLXByb2dyZXNzIHRpdGxlIHNoaW1tZXIgKHNlZSBgc2Vzc2lvbi10aXRsZS1zaGltbWVyYFxuLy8gaW4gc2Vzc2lvbnNMaXN0LmNzcykuIFVzZWQgdG8gcGhhc2UtYWxpZ24gdGhlIHNoaW1tZXIgYWNyb3NzIHJvd3MuXG5jb25zdCBTRVNTSU9OX1RJVExFX1NISU1NRVJfQU5JTUFUSU9OX05BTUUgPSAnc2Vzc2lvbi10aXRsZS1zaGltbWVyJztcbmNvbnN0IFNFU1NJT05fVElUTEVfU0hJTU1FUl9BTklNQVRJT05fTkFNRVMgPSBuZXcgU2V0KFtTRVNTSU9OX1RJVExFX1NISU1NRVJfQU5JTUFUSU9OX05BTUVdKTtcbmNvbnN0IFNFU1NJT05fVElUTEVfU0hJTU1FUl9QQVVTRURfQ0xBU1MgPSAnc2Vzc2lvbi10aXRsZS1zaGltbWVyLXBhdXNlZCc7XG5cbmludGVyZmFjZSBJU2Vzc2lvbkl0ZW1UZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHN0YXR1c0ljb246IFNlc3Npb25TdGF0dXNJY29uO1xuXHRyZWFkb25seSB0aXRsZTogSGlnaGxpZ2h0ZWRMYWJlbDtcblx0cmVhZG9ubHkgdGl0bGVDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSB0aXRsZVRvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBwZW5kaW5nVm9pY2VJbmRpY2F0b3I6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkZXRhaWxzUm93OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgYXBwcm92YWxSb3c6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBhcHByb3ZhbExhYmVsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgYXBwcm92YWxCdXR0b25Db250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBjaVJvdzogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGNpTGFiZWw6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBjaUJ1dHRvbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdHJlYWRvbmx5IHN0YXR1c0NvbnRleHQ6IElDb250ZXh0S2V5PFNlc3Npb25TdGF0dXM+O1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0c2Vzc2lvblJlc291cmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGFyY2hpdmVBbmltYXRpb246IElTZXNzaW9uQXJjaGl2ZUFuaW1hdGlvbiB8IHVuZGVmaW5lZDtcbn1cblxuLyoqIFBheWxvYWQgZW1pdHRlZCB3aGVuIHRoZSB1c2VyIGFwcHJvdmVzIGEgc2Vzc2lvbidzIHBlbmRpbmcgYWN0aW9uLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQXBwcm92ZWRTZXNzaW9uIHtcblx0cmVhZG9ubHkgc2Vzc2lvbjogSVNlc3Npb247XG5cdC8qKlxuXHQgKiBJZGVudGl0eSBvZiB0aGUgYXBwcm92YWwgdGhhdCB3YXMgYWxsb3dlZCwgc28gY29uc3VtZXJzIGNhbiB0ZWxsIHRoaXMgZXhhY3Rcblx0ICogYXBwcm92YWwgYXBhcnQgZnJvbSBhIGxhdGVyLCBkaXN0aW5jdCBvbmUgb24gdGhlIHNhbWUgc2Vzc2lvbi5cblx0ICovXG5cdHJlYWRvbmx5IGFwcHJvdmFsSWQ6IHN0cmluZztcbn1cblxuLyoqIFN1bW1hcnkgb2YgYSBzZXNzaW9uJ3MgZmFpbGluZyBDSSBjaGVja3MsIGJhY2tpbmcgaXRzIFwiRml4IENJXCIgcm93LiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvbkNJRml4U3RhdGUge1xuXHQvKiogTnVtYmVyIG9mIGNoZWNrcyB0aGF0IGhhdmUgY29tcGxldGVkIHdpdGggYSBmYWlsaW5nIGNvbmNsdXNpb24uICovXG5cdHJlYWRvbmx5IGZhaWxlZDogbnVtYmVyO1xuXHQvKiogTnVtYmVyIG9mIGNoZWNrcyBzdGlsbCBydW5uaW5nIG9yIHF1ZXVlZC4gKi9cblx0cmVhZG9ubHkgcGVuZGluZzogbnVtYmVyO1xufVxuXG4vKipcbiAqIFN1cHBsaWVzIHRoZSBwZXItc2Vzc2lvbiBcIkZpeCBDSVwiIHJvdyBzaG93biBmb3IgYmxvY2tlZCBzZXNzaW9ucyB3aG9zZSBwdWxsXG4gKiByZXF1ZXN0IGhhcyBmYWlsaW5nIENJIGNoZWNrcy4gT25seSB0aGUgYmxvY2tlZC1zZXNzaW9ucyBkcm9wZG93biBwcm92aWRlcyBvbmVcbiAqICh2aWEge0BsaW5rIElTZXNzaW9uc0ZsYXRMaXN0T3B0aW9ucy5jaUZpeE1vZGVsfSksIHNvIHRoZSByb3cgbmV2ZXIgYXBwZWFycyBpblxuICogYW55IG90aGVyIHNlc3Npb24gbGlzdC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvbkNJRml4TW9kZWwge1xuXHQvKipcblx0ICogT2JzZXJ2YWJsZSBDSS1mYWlsdXJlIHN1bW1hcnkgZm9yIGEgc2Vzc2lvbiwgb3IgYHVuZGVmaW5lZGAgd2hlbiBpdCBoYXMgbm9cblx0ICogZmFpbGluZyBjaGVja3MgKG9yIHRoZSB1c2VyIGFscmVhZHkgcmVxdWVzdGVkIGEgZml4IGZvciB0aGUgY3VycmVudCBjb21taXQpLlxuXHQgKi9cblx0Z2V0Q0lGaXgoc2Vzc2lvbjogSVNlc3Npb24pOiBJT2JzZXJ2YWJsZTxJU2Vzc2lvbkNJRml4U3RhdGUgfCB1bmRlZmluZWQ+O1xuXHQvKiogS2ljayBvZmYgdGhlIGZpeC1DSSBmbG93IGZvciB0aGUgc2Vzc2lvbiBpbiB0aGUgYmFja2dyb3VuZCAobm8gc2Vzc2lvbiBpcyBvcGVuZWQpLiAqL1xuXHRmaXhDSShzZXNzaW9uOiBJU2Vzc2lvbik6IHZvaWQ7XG59XG5cbmNsYXNzIFNlc3Npb25JdGVtUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNlc3Npb25MaXN0SXRlbSwgRnV6enlTY29yZSwgSVNlc3Npb25JdGVtVGVtcGxhdGU+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ3Nlc3Npb24taXRlbSc7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBTZXNzaW9uSXRlbVJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9BUFBST1ZBTF9ST1dfTElORV9IRUlHSFQgPSAxODtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX0FQUFJPVkFMX1JPV19PVkVSSEVBRCA9IDE0O1xuXG5cdC8qKiBIZWlnaHQgb2YgdGhlIHNpbmdsZS1saW5lIFwiRml4IENJXCIgcm93IChsYWJlbCArIG9yYW5nZSBidXR0b24pLCBpbmNsdWRpbmcgaXRzIHRvcCBtYXJnaW4uICovXG5cdHN0YXRpYyByZWFkb25seSBDSV9ST1dfSEVJR0hUID0gMzI7XG5cblx0c3RhdGljIGdldEFwcHJvdmFsUm93SGVpZ2h0KGxhYmVsOiBzdHJpbmcsIG1heExpbmVzOiBudW1iZXIgPSBERUZBVUxUX0FQUFJPVkFMX1JPV19NQVhfTElORVMpOiBudW1iZXIge1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IE1hdGgubWluKGxhYmVsLnNwbGl0KC9cXHI/XFxuLykubGVuZ3RoLCBtYXhMaW5lcyk7XG5cdFx0cmV0dXJuIGxpbmVDb3VudCAqIFNlc3Npb25JdGVtUmVuZGVyZXIuX0FQUFJPVkFMX1JPV19MSU5FX0hFSUdIVCArIFNlc3Npb25JdGVtUmVuZGVyZXIuX0FQUFJPVkFMX1JPV19PVkVSSEVBRDtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSXRlbUhlaWdodCA9IG5ldyBFbWl0dGVyPElTZXNzaW9uPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUl0ZW1IZWlnaHQ6IEV2ZW50PElTZXNzaW9uPiA9IHRoaXMuX29uRGlkQ2hhbmdlSXRlbUhlaWdodC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFwcHJvdmVTZXNzaW9uID0gbmV3IEVtaXR0ZXI8SUFwcHJvdmVkU2Vzc2lvbj4oKTtcblx0LyoqIEZpcmVzIHdoZW4gdGhlIHVzZXIgYXBwcm92ZXMgYSBzZXNzaW9uJ3MgcGVuZGluZyBhY3Rpb24gdmlhIGl0cyBcIkFsbG93XCIgYnV0dG9uLiAqL1xuXHRyZWFkb25seSBvbkRpZEFwcHJvdmVTZXNzaW9uOiBFdmVudDxJQXBwcm92ZWRTZXNzaW9uPiA9IHRoaXMuX29uRGlkQXBwcm92ZVNlc3Npb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGVtcGxhdGVzQnlTZXNzaW9uID0gbmV3IE1hcDxzdHJpbmcsIElTZXNzaW9uSXRlbVRlbXBsYXRlPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogeyBncm91cGluZzogKCkgPT4gU2Vzc2lvbnNHcm91cGluZzsgaXNQaW5uZWQ6IChzZXNzaW9uOiBJU2Vzc2lvbikgPT4gYm9vbGVhbjsgaXNSZWFkOiAoc2Vzc2lvbjogSVNlc3Npb24pID0+IGJvb2xlYW47IHZpc2libGVTZXNzaW9uczogSU9ic2VydmFibGU8cmVhZG9ubHkgKElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKVtdPjsgZ2V0TXVsdGlTZWxlY3RlZFNlc3Npb25zOiAoc2Vzc2lvbjogSVNlc3Npb24pID0+IElTZXNzaW9uW107IHNob3dIb3ZlcjogYm9vbGVhbjsgYXBwcm92YWxSb3dNYXhMaW5lczogbnVtYmVyOyB0b29sYmFyTWVudUlkOiBNZW51SWQgfCB1bmRlZmluZWQ7IGhhbmRsZVRvb2xiYXJBY3Rpb24/OiAoYWN0aW9uOiBJQWN0aW9uLCBzZXNzaW9uOiBJU2Vzc2lvbikgPT4gYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj47IG9uRGlkUmVxdWVzdFJlbmFtZT86IChzZXNzaW9uOiBJU2Vzc2lvbikgPT4gdm9pZCB9LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYXBwcm92YWxNb2RlbDogQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNpRml4TW9kZWw6IElTZXNzaW9uQ0lGaXhNb2RlbCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zUHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHQvLyBURU1QT1JBUlkgXHUyMDE0IHNlZSB0aGUgbm90ZSBvbiB0aGUgYElBZ2VudFNlc3Npb25zU2VydmljZWAgaW1wb3J0IGFib3ZlICgjMzIwNDgwKS5cblx0XHRwcml2YXRlIHJlYWRvbmx5IGFnZW50U2Vzc2lvbnNTZXJ2aWNlOiBJQWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdm9pY2VQbGF5YmFja1NlcnZpY2U6IElWb2ljZVBsYXliYWNrU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVNlc3Npb25JdGVtVGVtcGxhdGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Nlc3Npb24taXRlbScpO1xuXG5cdFx0Y29uc3QgaWNvbkNvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2Vzc2lvbi1pY29uJykpO1xuXHRcdGNvbnN0IHN0YXR1c0ljb24gPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uU3RhdHVzSWNvbiwgaWNvbkNvbnRhaW5lcikpO1xuXHRcdGNvbnN0IG1haW5Db2wgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNlc3Npb24tbWFpbicpKTtcblx0XHRjb25zdCB0aXRsZVJvdyA9IERPTS5hcHBlbmQobWFpbkNvbCwgJCgnLnNlc3Npb24tdGl0bGUtcm93JykpO1xuXHRcdGNvbnN0IHRpdGxlQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aXRsZVJvdywgJCgnLnNlc3Npb24tdGl0bGUnKSk7XG5cdFx0Y29uc3QgdGl0bGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEhpZ2hsaWdodGVkTGFiZWwodGl0bGVDb250YWluZXIpKTtcblx0XHQvLyBUaGUgc2hpbW1lcidzIENTUyBhbmltYXRpb24gcmVzdGFydHMgZnJvbSB6ZXJvIHdoZW5ldmVyIGl0IChyZSlzdGFydHMgXHUyMDE0XG5cdFx0Ly8gZS5nLiBzZWxlY3RpbmcgdGhlbiBkZXNlbGVjdGluZyBhbiBpbi1wcm9ncmVzcyByb3cgcmUtYWRkcyB0aGUgYW5pbWF0aW9uXG5cdFx0Ly8gdmlhIHRoZSBgOm5vdCguc2VsZWN0ZWQpYCBzZWxlY3RvciwgYW5kIHJvd3MgYWxyZWFkeSBzaGltbWVyaW5nIGF0IGZpcnN0XG5cdFx0Ly8gcmVuZGVyIGVhY2ggc3RhcnRlZCBvbiB0aGVpciBvd24gY2xvY2suIEFuY2hvciBldmVyeSAocmUpc3RhcnQgdG8gdGhlXG5cdFx0Ly8gc2hhcmVkIGRvY3VtZW50IHRpbWVsaW5lIHNvIGFsbCByb3dzIHN0YXkgcGVyZmVjdGx5IGluIHBoYXNlLiBUaGlzIGZpcmVzXG5cdFx0Ly8gb25jZSBwZXIgc3RhcnQgKG5vdCBwZXIgZnJhbWUpLCBzbyBpdCBpcyBlZmZlY3RpdmVseSBmcmVlLlxuXHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRpdGxlQ29udGFpbmVyLCBET00uRXZlbnRUeXBlLkFOSU1BVElPTl9TVEFSVCwgKGU6IEFuaW1hdGlvbkV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS50YXJnZXQgPT09IHRpdGxlQ29udGFpbmVyICYmIGUuYW5pbWF0aW9uTmFtZSA9PT0gU0VTU0lPTl9USVRMRV9TSElNTUVSX0FOSU1BVElPTl9OQU1FKSB7XG5cdFx0XHRcdHN5bmNocm9uaXplQ1NTQW5pbWF0aW9ucyh0aXRsZUNvbnRhaW5lciwgeyBhbmltYXRpb25OYW1lczogU0VTU0lPTl9USVRMRV9TSElNTUVSX0FOSU1BVElPTl9OQU1FUyB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBhdXNlQ1NTQW5pbWF0aW9uc1doZW5IaWRkZW4odGl0bGVDb250YWluZXIsIHtcblx0XHRcdHBhdXNlZENsYXNzOiBTRVNTSU9OX1RJVExFX1NISU1NRVJfUEFVU0VEX0NMQVNTLFxuXHRcdFx0YW5pbWF0aW9uTmFtZXM6IFNFU1NJT05fVElUTEVfU0hJTU1FUl9BTklNQVRJT05fTkFNRVMsXG5cdFx0fSkpO1xuXHRcdGNvbnN0IHRpdGxlVG9vbGJhckNvbnRhaW5lciA9IERPTS5hcHBlbmQodGl0bGVSb3csICQoJy5zZXNzaW9uLXRpdGxlLXRvb2xiYXInKSk7XG5cdFx0Ly8gU2hvd24gd2hlbiBhIHZvaWNlIHJlc3BvbnNlIGFycml2ZWQgd2hpbGUgdGhpcyBzZXNzaW9uIHdhcyB1bmZvY3VzZWQgYW5kXG5cdFx0Ly8gaXMgaGVsZCB1bnRpbCBpdCBpcyAobWlycm9ycyB0aGUgbWFpbiB3aW5kb3cncyBzZXNzaW9ucyB2aWV3ZXIpLlxuXHRcdGNvbnN0IHBlbmRpbmdWb2ljZUluZGljYXRvciA9IERPTS5hcHBlbmQodGl0bGVSb3csICQoJy5zZXNzaW9uLXBlbmRpbmctdm9pY2UtaW5kaWNhdG9yJykpO1xuXHRcdC8vIFRoZSBsaXN0IG9wZW5zIGEgc2Vzc2lvbiBvbiBjbGljayBhbmQgb24gR2VzdHVyZSBgdGFwYCAodG91Y2gpLlxuXHRcdC8vIERPTSBldmVudCBwcm9wYWdhdGlvbiBzdG9wcyBvbmx5IGNvdmVyIG1vdXNlL3BvaW50ZXIgZXZlbnRzOyB0aGVcblx0XHQvLyBsaXN0J3MgdGFwIGhhbmRsZXIgcmVhZHMgZnJvbSBgR2VzdHVyZWAgZGlyZWN0bHksIGJ5cGFzc2luZ1xuXHRcdC8vIGJ1YmJsaW5nLiBDb21iaW5lIGJvdGg6IHN0b3AgcG9pbnRlci9jbGljayBmb3IgbW91c2UsIGFuZFxuXHRcdC8vIHJlZ2lzdGVyIHRoZSB0b29sYmFyIHdpdGggYEdlc3R1cmUuaWdub3JlVGFyZ2V0YCBzbyBzeW50aGVzaXplZFxuXHRcdC8vIHRhcCBldmVudHMgb24gdG91Y2ggbmV2ZXIgcmVhY2ggdGhlIGxpc3QgZWl0aGVyLlxuXHRcdGZvciAoY29uc3QgZXZlbnRUeXBlIG9mIFsncG9pbnRlcmRvd24nLCAncG9pbnRlcnVwJywgJ2NsaWNrJywgJ2RibGNsaWNrJ10gYXMgY29uc3QpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRpdGxlVG9vbGJhckNvbnRhaW5lciwgZXZlbnRUeXBlLCBlID0+IGUuc3RvcFByb3BhZ2F0aW9uKCkpKTtcblx0XHR9XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEdlc3R1cmUuaWdub3JlVGFyZ2V0KHRpdGxlVG9vbGJhckNvbnRhaW5lcikpO1xuXHRcdGNvbnN0IGRldGFpbHNSb3cgPSBET00uYXBwZW5kKG1haW5Db2wsICQoJy5zZXNzaW9uLWRldGFpbHMtcm93JykpO1xuXG5cdFx0Ly8gQXBwcm92YWwgcm93XG5cdFx0Y29uc3QgYXBwcm92YWxSb3cgPSBET00uYXBwZW5kKG1haW5Db2wsICQoJy5zZXNzaW9uLWFwcHJvdmFsLXJvdycpKTtcblx0XHRjb25zdCBhcHByb3ZhbExhYmVsID0gRE9NLmFwcGVuZChhcHByb3ZhbFJvdywgJCgnc3Bhbi5zZXNzaW9uLWFwcHJvdmFsLWxhYmVsJykpO1xuXHRcdGNvbnN0IGFwcHJvdmFsQnV0dG9uQ29udGFpbmVyID0gRE9NLmFwcGVuZChhcHByb3ZhbFJvdywgJCgnLnNlc3Npb24tYXBwcm92YWwtYnV0dG9uJykpO1xuXG5cdFx0Ly8gRml4LUNJIHJvdyBcdTIwMTQgc2hvd24gb25seSBpbiB0aGUgYmxvY2tlZC1zZXNzaW9ucyBsaXN0IGZvciBzZXNzaW9ucyB3aG9zZVxuXHRcdC8vIHB1bGwgcmVxdWVzdCBoYXMgZmFpbGluZyBDSSBjaGVja3MuIFN0eWxlZCBsaWtlIHRoZSBjaGF0IGlucHV0J3MgQ0kgYmFubmVyLlxuXHRcdGNvbnN0IGNpUm93ID0gRE9NLmFwcGVuZChtYWluQ29sLCAkKCcuc2Vzc2lvbi1jaS1yb3cnKSk7XG5cdFx0Y29uc3QgY2lMYWJlbCA9IERPTS5hcHBlbmQoY2lSb3csICQoJ3NwYW4uc2Vzc2lvbi1jaS1sYWJlbCcpKTtcblx0XHRjb25zdCBjaUJ1dHRvbkNvbnRhaW5lciA9IERPTS5hcHBlbmQoY2lSb3csICQoJy5zZXNzaW9uLWNpLWJ1dHRvbicpKTtcblx0XHQvLyBUaGUgbGlzdCBvcGVucyBhIHNlc3Npb24gb24gY2xpY2svdGFwLiBUaGUgXCJGaXggQ0lcIiBidXR0b24gb3BlbnMgdGhlXG5cdFx0Ly8gc2Vzc2lvbiBpdHNlbGYgYXMgcGFydCBvZiBpdHMgZmxvdywgc28gc3dhbGxvdyByb3cgY2xpY2tzIGhlcmUgdG8gc3RvcFxuXHRcdC8vIHRoZW0gYnViYmxpbmcgdG8gdGhlIHRyZWUgYW5kIHRyaWdnZXJpbmcgYSBzZWNvbmQsIHJhY2luZyBvcGVuLlxuXHRcdGZvciAoY29uc3QgZXZlbnRUeXBlIG9mIFsncG9pbnRlcmRvd24nLCAncG9pbnRlcnVwJywgJ2NsaWNrJywgJ2RibGNsaWNrJ10gYXMgY29uc3QpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNpUm93LCBldmVudFR5cGUsIGUgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSkpO1xuXHRcdH1cblx0XHRkaXNwb3NhYmxlcy5hZGQoR2VzdHVyZS5pZ25vcmVUYXJnZXQoY2lSb3cpKTtcblxuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKGNvbnRhaW5lcikpO1xuXHRcdGNvbnN0IHN0YXR1c0NvbnRleHQgPSBTZXNzaW9uSXRlbVN0YXR1c0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZV0pKSk7XG5cdFx0bGV0IHRpdGxlVG9vbGJhcjogTWVudVdvcmtiZW5jaFRvb2xCYXIgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy50b29sYmFyTWVudUlkKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25SdW5uZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25JdGVtQWN0aW9uUnVubmVyKHRoaXMub3B0aW9ucy5nZXRNdWx0aVNlbGVjdGVkU2Vzc2lvbnMsIHRoaXMub3B0aW9ucy5oYW5kbGVUb29sYmFyQWN0aW9uKSk7XG5cdFx0XHR0aXRsZVRvb2xiYXIgPSBkaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHRpdGxlVG9vbGJhckNvbnRhaW5lciwgdGhpcy5vcHRpb25zLnRvb2xiYXJNZW51SWQsIHtcblx0XHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHRcdFx0YWN0aW9uUnVubmVyLFxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGNvbnRhaW5lciwgc3RhdHVzSWNvbiwgdGl0bGUsIHRpdGxlQ29udGFpbmVyLCB0aXRsZVRvb2xiYXIsIHBlbmRpbmdWb2ljZUluZGljYXRvciwgZGV0YWlsc1JvdywgYXBwcm92YWxSb3csIGFwcHJvdmFsTGFiZWwsIGFwcHJvdmFsQnV0dG9uQ29udGFpbmVyLCBjaVJvdywgY2lMYWJlbCwgY2lCdXR0b25Db250YWluZXIsIGNvbnRleHRLZXlTZXJ2aWNlLCBzdGF0dXNDb250ZXh0LCBkaXNwb3NhYmxlcywgZWxlbWVudERpc3Bvc2FibGVzLCBzZXNzaW9uUmVzb3VyY2U6IHVuZGVmaW5lZCwgYXJjaGl2ZUFuaW1hdGlvbjogdW5kZWZpbmVkIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxTZXNzaW9uTGlzdEl0ZW0sIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IElTZXNzaW9uSXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IG5vZGUuZWxlbWVudDtcblx0XHRpZiAoIWlzU2Vzc2lvbkl0ZW0oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5yZW5kZXJTZXNzaW9uKGVsZW1lbnQsIHRlbXBsYXRlLCBjcmVhdGVNYXRjaGVzKG5vZGUuZmlsdGVyRGF0YSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTZXNzaW9uKGVsZW1lbnQ6IElTZXNzaW9uLCB0ZW1wbGF0ZTogSVNlc3Npb25JdGVtVGVtcGxhdGUsIG1hdGNoZXM/OiBJTWF0Y2hbXSk6IHZvaWQge1xuXHRcdHRoaXMuYmluZFRlbXBsYXRlVG9TZXNzaW9uKHRlbXBsYXRlLCBlbGVtZW50KTtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGlmICh0aGlzLm9wdGlvbnMub25EaWRSZXF1ZXN0UmVuYW1lKSB7XG5cdFx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGVtcGxhdGUudGl0bGUuZWxlbWVudCwgRE9NLkV2ZW50VHlwZS5EQkxDTElDSywgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHRldmVudC5idXR0b24gIT09IDAgfHxcblx0XHRcdFx0XHRldmVudC5hbHRLZXkgfHxcblx0XHRcdFx0XHRldmVudC5jdHJsS2V5IHx8XG5cdFx0XHRcdFx0ZXZlbnQubWV0YUtleSB8fFxuXHRcdFx0XHRcdGV2ZW50LnNoaWZ0S2V5IHx8XG5cdFx0XHRcdFx0IWVsZW1lbnQuY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzUmVuYW1lXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLm9wdGlvbnMub25EaWRSZXF1ZXN0UmVuYW1lPy4oZWxlbWVudCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gVEVNUE9SQVJZICgjMzIwNDgwKTogdHJpZ2dlciBsYXp5IHJlc29sdmUgb2YgZXhwZW5zaXZlIHNlc3Npb25cblx0XHQvLyBwcm9wZXJ0aWVzIChlLmcuIGNoYW5nZXMpIGZvciByb3dzIHRoYXQgc2Nyb2xsIGludG8gdmlldywgc28gcHJvdmlkZXJzXG5cdFx0Ly8gdGhhdCBwb3B1bGF0ZSB0aGVtIG9uIGRlbWFuZCBkZWxpdmVyIGZyZXNoIGRhdGEgYnkgdGhlIHRpbWUgdGhlIHJvd1xuXHRcdC8vIHJlbmRlcnMuIFRoaXMgcmVhY2hlcyBpbnRvIGEgQ29waWxvdC1wcm92aWRlciBpbnRlcm5hbCBhbmQgbXVzdCBiZVxuXHRcdC8vIG1vdmVkIGludG8gdGhlIHByb3ZpZGVyIFx1MjAxNCBzZWUgdGhlIG5vdGUgb24gdGhlIGltcG9ydCBhYm92ZS5cblx0XHR0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLm9ic2VydmVTZXNzaW9uKGVsZW1lbnQucmVzb3VyY2UpO1xuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5zaG93SG92ZXIpIHtcblx0XHRcdC8vIFJpY2ggaG92ZXIgb24gdGhlIHJvdyBzaG93aW5nIGZvbGRlciwgYnJhbmNoLCBkaWZmIHN0YXRzIGFuZCBwcm92aWRlci5cblx0XHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGVtcGxhdGUuY29udGFpbmVyLCAoKSA9PiAoe1xuXHRcdFx0XHRjb250ZW50OiBidWlsZFNlc3Npb25Ib3ZlckNvbnRlbnQoZWxlbWVudCwgdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UpLFxuXHRcdFx0XHRhcHBlYXJhbmNlOiB7IHNob3dQb2ludGVyOiB0cnVlIH0sXG5cdFx0XHRcdHBvc2l0aW9uOiB7IGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uUklHSFQsIGZvcmNlUG9zaXRpb246IHRydWUgfSxcblx0XHRcdFx0cGVyc2lzdGVuY2U6IHsgaGlkZU9uSG92ZXI6IGZhbHNlIH0sXG5cdFx0XHR9KSwgeyBncm91cElkOiAnc2Vzc2lvbnMtbGlzdCcgfSkpO1xuXHRcdH1cblxuXHRcdC8vIFBlbmRpbmcgdm9pY2UgcmVzcG9uc2UgaW5kaWNhdG9yOiBhIHJlc3BvbnNlIGFycml2ZWQgd2hpbGUgdGhpcyBzZXNzaW9uXG5cdFx0Ly8gd2FzIHVuZm9jdXNlZCBhbmQgaXMgaGVsZCB1bnRpbCBpdCBpcy5cblx0XHRjb25zdCBwZW5kaW5nVm9pY2VSZXNvdXJjZSA9IGVsZW1lbnQucmVzb3VyY2U7XG5cdFx0dGVtcGxhdGUucGVuZGluZ1ZvaWNlSW5kaWNhdG9yLmNsYXNzTmFtZSA9ICdzZXNzaW9uLXBlbmRpbmctdm9pY2UtaW5kaWNhdG9yICcgKyBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi51bm11dGUpO1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoXG5cdFx0XHRnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSxcblx0XHRcdHRlbXBsYXRlLnBlbmRpbmdWb2ljZUluZGljYXRvcixcblx0XHRcdGxvY2FsaXplKCdwZW5kaW5nVm9pY2VSZXNwb25zZScsIFwiVm9pY2UgcmVzcG9uc2UgcmVhZHlcIiksXG5cdFx0KSk7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl92b2ljZVBsYXliYWNrU2VydmljZS5wZW5kaW5nUmVzcG9uc2VWZXJzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHRlbXBsYXRlLnBlbmRpbmdWb2ljZUluZGljYXRvci5jbGFzc0xpc3QudG9nZ2xlKCd2aXNpYmxlJywgdGhpcy5fdm9pY2VQbGF5YmFja1NlcnZpY2UuaGFzUGVuZGluZ1Jlc3BvbnNlKHBlbmRpbmdWb2ljZVJlc291cmNlKSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVG9vbGJhciBjb250ZXh0XG5cdFx0aWYgKHRlbXBsYXRlLnRpdGxlVG9vbGJhcikge1xuXHRcdFx0dGVtcGxhdGUudGl0bGVUb29sYmFyLmNvbnRleHQgPSBlbGVtZW50O1xuXHRcdH1cblxuXHRcdC8vIENvbnRleHQga2V5c1xuXHRcdGNvbnN0IGlzUGlubmVkID0gdGhpcy5vcHRpb25zLmlzUGlubmVkKGVsZW1lbnQpO1xuXHRcdElzU2Vzc2lvblBpbm5lZENvbnRleHQuYmluZFRvKHRlbXBsYXRlLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoaXNQaW5uZWQpO1xuXHRcdFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5iaW5kVG8odGVtcGxhdGUuY29udGV4dEtleVNlcnZpY2UpLnNldChlbGVtZW50LmlzQXJjaGl2ZWQuZ2V0KCkpO1xuXHRcdFNlc3Npb25Jc1JlYWRDb250ZXh0LmJpbmRUbyh0ZW1wbGF0ZS5jb250ZXh0S2V5U2VydmljZSkuc2V0KHRoaXMub3B0aW9ucy5pc1JlYWQoZWxlbWVudCkpO1xuXHRcdFNlc3Npb25JdGVtSGFzQnJhbmNoTmFtZUNvbnRleHQuYmluZFRvKHRlbXBsYXRlLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoISFlbGVtZW50LndvcmtzcGFjZS5nZXQoKT8uZm9sZGVyc1swXT8uZ2l0UmVwb3NpdG9yeT8uYnJhbmNoTmFtZT8udHJpbSgpKTtcblxuXHRcdC8vIFBpbm5lZCAmIGFyY2hpdmVkIHN0eWxpbmcgXHUyMDE0IHJlYWN0aXZlXG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpc0FyY2hpdmVkID0gZWxlbWVudC5pc0FyY2hpdmVkLnJlYWQocmVhZGVyKTtcblx0XHRcdHRlbXBsYXRlLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdhcmNoaXZlZCcsIGlzQXJjaGl2ZWQpO1xuXHRcdFx0Ly8gT25seSBhcHBseSBwaW5uZWQgc3R5bGluZyB3aGVuIG5vdCBhcmNoaXZlZCB0byBhdm9pZCBwZXJzaXN0ZW50IHRvb2xiYXJzIG9uIGFyY2hpdmVkIHNlc3Npb25zXG5cdFx0XHR0ZW1wbGF0ZS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgncGlubmVkJywgaXNQaW5uZWQgJiYgIWlzQXJjaGl2ZWQpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFN0aWNreSBzdHlsaW5nIFx1MjAxNCByZWFjdGl2ZSBvbiB0aGUgd3JhcHBlcidzIHN0aWNreSBvYnNlcnZhYmxlXG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB3cmFwcGVyID0gdGhpcy5vcHRpb25zLnZpc2libGVTZXNzaW9ucy5yZWFkKHJlYWRlcikuZmluZChzID0+IHM/LnNlc3Npb25JZCA9PT0gZWxlbWVudC5zZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3QgaXNTdGlja3kgPSB3cmFwcGVyID8gd3JhcHBlci5zdGlja3kucmVhZChyZWFkZXIpIDogZmFsc2U7XG5cdFx0XHR0ZW1wbGF0ZS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc3RpY2t5JywgaXNTdGlja3kpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEljb24gXHUyMDE0IHJlYWN0aXZlIGJhc2VkIG9uIHN0YXR1cywgcmVhZCBzdGF0ZSwgUFIsIGFuZCBtb3Rpb24gcHJlZmVyZW5jZS5cblx0XHQvLyBUaGUgY3VycmVudCBpY29uIENTUyBzZWxlY3RvciBpcyBzdG9yZWQgb24gdGhlIHRlbXBsYXRlIChub3QgYSBsb2NhbFxuXHRcdC8vIHZhcmlhYmxlKSBzbyBpdCBzdXJ2aXZlcyBhY3Jvc3MgcmVuZGVyU2Vzc2lvbiBjYWxscyBcdTIwMTQgdGhlIHRyZWUgcmUtcmVuZGVyc1xuXHRcdC8vIGFsbCB2aXNpYmxlIHJvd3Mgb24gZXZlcnkgc3BsaWNlLCB3aGljaCBjbGVhcnMgZWxlbWVudERpc3Bvc2FibGVzIGFuZFxuXHRcdC8vIHJlY3JlYXRlcyB0aGUgYXV0b3J1bi4gV2l0aG91dCB0ZW1wbGF0ZS1sZXZlbCB0cmFja2luZywgdGhlIHNlbGVjdG9yXG5cdFx0Ly8gcmVzZXRzIHRvIHVuZGVmaW5lZCBhbmQgdGhlIERPTSBpcyByZWJ1aWx0IGV2ZXJ5IHRpbWUsIHJlc3RhcnRpbmcgdGhlXG5cdFx0Ly8gQ1NTIHNwaW4gYW5pbWF0aW9uLlxuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0YXR1cyA9IGVsZW1lbnQuc3RhdHVzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRlbXBsYXRlLnN0YXR1c0NvbnRleHQuc2V0KHNlc3Npb25TdGF0dXMpO1xuXHRcdFx0Y29uc3QgaXNSZWFkID0gdGhpcy5vcHRpb25zLmlzUmVhZChlbGVtZW50KTtcblx0XHRcdGNvbnN0IGlzQXJjaGl2ZWQgPSBlbGVtZW50LmlzQXJjaGl2ZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZ2l0SHViSW5mbyA9IGVsZW1lbnQud29ya3NwYWNlLnJlYWQocmVhZGVyKT8uZm9sZGVyc1swXT8uZ2l0UmVwb3NpdG9yeT8uZ2l0SHViSW5mby5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBpc1F1aWNrQ2hhdCA9IGVsZW1lbnQuaXNRdWlja0NoYXQ/LnJlYWQocmVhZGVyKSA/PyBmYWxzZTtcblx0XHRcdGNvbnN0IGNvbXBsZXRlZFN0YXRlSWNvbiA9IGdpdEh1YkluZm8/LnB1bGxSZXF1ZXN0Py5pY29uO1xuXG5cdFx0XHQvLyBUaGUgc3RhdHVzIGljb24gd2lkZ2V0IHNuYXBzIG9uIHJvdyByZWN5Y2xpbmcgYW5kIGNyb3NzLWZhZGVzIHJlYWwgc3RhdGUgY2hhbmdlcy5cblx0XHRcdHRlbXBsYXRlLnN0YXR1c0ljb24uc2V0U3RhdHVzKHNlc3Npb25TdGF0dXMsIGlzUmVhZCwgaXNBcmNoaXZlZCwgY29tcGxldGVkU3RhdGVJY29uLCBlbGVtZW50LnJlc291cmNlKTtcblx0XHRcdC8vIFRoZSB0aXRsZSBzaGltbWVyICh0b2dnbGVkIGJ5IHRoZSBgaW4tcHJvZ3Jlc3NgIGNsYXNzKSBpcyBwaGFzZS1hbGlnbmVkXG5cdFx0XHQvLyBhY3Jvc3Mgcm93cyB2aWEgYW4gYGFuaW1hdGlvbnN0YXJ0YCBoYW5kbGVyIG9uIHRoZSB0aXRsZSBlbGVtZW50LCBzbyBub1xuXHRcdFx0Ly8gcGVyLXN0YXRlIHdvcmsgaXMgbmVlZGVkIGhlcmUuXG5cdFx0XHR0ZW1wbGF0ZS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaW4tcHJvZ3Jlc3MnLCBzZXNzaW9uU3RhdHVzID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXHRcdFx0dGVtcGxhdGUuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ25lZWRzLWlucHV0Jywgc2Vzc2lvblN0YXR1cyA9PT0gU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0KTtcblx0XHRcdHRlbXBsYXRlLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd1bnJlYWQnLCAhaXNSZWFkICYmICFpc0FyY2hpdmVkKTtcblx0XHRcdC8vIFF1aWNrLWNoYXQgcm93cyB1c2UgYSBtb3JlIGNvbXBhY3QgbGF5b3V0IChzbWFsbGVyIGljb24sIHRpZ2h0ZXIgcm93IGhlaWdodCkuXG5cdFx0XHR0ZW1wbGF0ZS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgncXVpY2stY2hhdCcsIGlzUXVpY2tDaGF0KTtcblx0XHR9KSk7XG5cblx0XHQvLyBUaXRsZSBcdTIwMTQgcmVhY3RpdmVcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHRpdGxlVGV4dCA9IGVsZW1lbnQudGl0bGUucmVhZChyZWFkZXIpO1xuXHRcdFx0dGVtcGxhdGUudGl0bGUuc2V0KHRpdGxlVGV4dCwgbWF0Y2hlcyk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRGV0YWlscyByb3cgXHUyMDE0IHJlYWN0aXZlOiBiYWRnZSBcdTAwQjcgZGlmZiBzdGF0cyBcdTAwQjcgdGltZSBcdTAwQjcgc3RhdHVzIGRlc2NyaXB0aW9uXG5cdFx0Ly8gKHF1aWNrIGNoYXRzIHVzZSBhIG1vcmUgY29tcGFjdCByb3c6IG5vIGRpZmYgc3RhdHMvdGltZS90eXBlLWljb24sIGFuZFxuXHRcdC8vIG5vIFwiV29ya2luZy4uLlwiIHRleHQgc2luY2UgdGhlaXIgc3Bpbm5lciBzdGF0dXMgaWNvbiBhbHJlYWR5IGNvbnZleXMgaXQpXG5cdFx0Y29uc3QgdGltZURpc3Bvc2FibGUgPSB0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbkRpc3Bvc2FibGUgPSB0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25TdGF0dXMgPSBlbGVtZW50LnN0YXR1cy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBlbGVtZW50LndvcmtzcGFjZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGVsZW1lbnQuZGVzY3JpcHRpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaXNRdWlja0NoYXQgPSBlbGVtZW50LmlzUXVpY2tDaGF0Py5yZWFkKHJlYWRlcikgPz8gZmFsc2U7XG5cblx0XHRcdC8vIENsZWFyIGFuZCByZWJ1aWxkIGRldGFpbHMgcm93XG5cdFx0XHRET00uY2xlYXJOb2RlKHRlbXBsYXRlLmRldGFpbHNSb3cpO1xuXG5cdFx0XHQvLyBRdWljayBjaGF0cyBhcmUgc2luZ2xlLWxpbmUgcm93cyB3aXRoIG5vIGRldGFpbHMgcm93IGF0IGFsbCAoaGlkZGVuXG5cdFx0XHQvLyB2aWEgQ1NTKSBcdTIwMTQgc2tpcCBidWlsZGluZyBpdHMgY29udGVudCBlbnRpcmVseS5cblx0XHRcdGlmIChpc1F1aWNrQ2hhdCkge1xuXHRcdFx0XHRkZXNjcmlwdGlvbkRpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdFx0dGltZURpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjaGFuZ2VzID0gZWxlbWVudC5jaGFuZ2VzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGNoYW5nZXNTdW1tYXJ5ID0gZWxlbWVudC5jaGFuZ2VzU3VtbWFyeT8ucmVhZChyZWFkZXIpO1xuXHRcdFx0bGV0IHRpbWVEYXRlOiBEYXRlIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBXaGVuIHRoZSBzZXNzaW9uIGlzIEluUHJvZ3Jlc3Mgb3IgTmVlZHNJbnB1dCwgaGlkZSB3b3Jrc3BhY2UvZGlmZi90aW1lIGRldGFpbHMgaW4gdGhpcyByb3dcblx0XHRcdGNvbnN0IGhpZGVEZXRhaWxzID0gc2Vzc2lvblN0YXR1cyA9PT0gU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzIHx8IHNlc3Npb25TdGF0dXMgPT09IFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dDtcblxuXHRcdFx0aWYgKCFoaWRlRGV0YWlscykge1xuXHRcdFx0XHR0aW1lRGF0ZSA9IGVsZW1lbnQudXBkYXRlZEF0LnJlYWQocmVhZGVyKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcGFydHM6IEhUTUxFbGVtZW50W10gPSBbXTtcblxuXHRcdFx0Ly8gVHlwZSBpY29uIChmb2xkZXIvd29ya3RyZWUvY2xvdWQpIFx1MjAxNCByZWd1bGFyIHNlc3Npb25zIG9ubHkuIFF1aWNrXG5cdFx0XHQvLyBjaGF0cyBzaG93IHRoZWlyIGNoYXQgaWNvbiBvbiB0aGUgc3RhdHVzIGljb24gaW5zdGVhZCAoc2VlIGFib3ZlKS5cblx0XHRcdGlmIChzZXNzaW9uU3RhdHVzICE9PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpIHtcblx0XHRcdFx0Y29uc3Qga2luZCA9IGdldFNlc3Npb25Xb3Jrc3BhY2VLaW5kKHdvcmtzcGFjZSwgZWxlbWVudC53b3JrdHJlZVBlbmRpbmc/LnJlYWQocmVhZGVyKSk7XG5cdFx0XHRcdGNvbnN0IGljb24gPSBraW5kID09PSBTZXNzaW9uV29ya3NwYWNlS2luZC5WaXJ0dWFsID8gQ29kaWNvbi5jbG91ZENvbXBhY3QgOiBraW5kID09PSBTZXNzaW9uV29ya3NwYWNlS2luZC5Gb2xkZXIgPyBDb2RpY29uLmZvbGRlckNvbXBhY3QgOiBDb2RpY29uLndvcmt0cmVlQ29tcGFjdDtcblx0XHRcdFx0Y29uc3QgdHlwZUljb25FbCA9IERPTS5hcHBlbmQodGVtcGxhdGUuZGV0YWlsc1JvdywgJCgnc3Bhbi5zZXNzaW9uLWRldGFpbHMtaWNvbicpKTtcblx0XHRcdFx0RE9NLmFwcGVuZCh0eXBlSWNvbkVsLCAkKGBzcGFuJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29uKX1gKSk7XG5cdFx0XHRcdHBhcnRzLnB1c2godHlwZUljb25FbCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdvcmtzcGFjZSBiYWRnZSBcdTIwMTQgc2hvdyB3aGVuIG5vdCBncm91cGVkIGJ5IHdvcmtzcGFjZSxcblx0XHRcdC8vIG9yIHdoZW4gdGhlIHNlc3Npb24gaXMgcGlubmVkL2FyY2hpdmVkICh0aGVpciBzZWN0aW9uIGhlYWRlcnNcblx0XHRcdC8vIGRvbid0IGNhcnJ5IHRoZSB3b3Jrc3BhY2UgbmFtZSlcblx0XHRcdGlmICghaGlkZURldGFpbHMgJiYgd29ya3NwYWNlICYmIChcblx0XHRcdFx0dGhpcy5vcHRpb25zLmdyb3VwaW5nKCkgIT09IFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlIHx8XG5cdFx0XHRcdHRoaXMub3B0aW9ucy5pc1Bpbm5lZChlbGVtZW50KSB8fFxuXHRcdFx0XHRlbGVtZW50LmlzQXJjaGl2ZWQucmVhZChyZWFkZXIpXG5cdFx0XHQpKSB7XG5cdFx0XHRcdGNvbnN0IGJhZGdlTGFiZWwgPSB0aGlzLmdldFdvcmtzcGFjZUJhZGdlTGFiZWwod29ya3NwYWNlKTtcblx0XHRcdFx0aWYgKGJhZGdlTGFiZWwpIHtcblx0XHRcdFx0XHRjb25zdCBiYWRnZUVsID0gRE9NLmFwcGVuZCh0ZW1wbGF0ZS5kZXRhaWxzUm93LCAkKCdzcGFuLnNlc3Npb24tYmFkZ2UnKSk7XG5cdFx0XHRcdFx0YmFkZ2VFbC50ZXh0Q29udGVudCA9IGJhZGdlTGFiZWw7XG5cdFx0XHRcdFx0cGFydHMucHVzaChiYWRnZUVsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBEaWZmIHN0YXRzXG5cdFx0XHRpZiAoIWhpZGVEZXRhaWxzICYmIChjaGFuZ2VzU3VtbWFyeSB8fCBjaGFuZ2VzLmxlbmd0aCA+IDApKSB7XG5cdFx0XHRcdGxldCBpbnNlcnRpb25zID0gMCwgZGVsZXRpb25zID0gMDtcblxuXHRcdFx0XHRpZiAoY2hhbmdlc1N1bW1hcnkpIHtcblx0XHRcdFx0XHRpbnNlcnRpb25zID0gY2hhbmdlc1N1bW1hcnkuYWRkaXRpb25zO1xuXHRcdFx0XHRcdGRlbGV0aW9ucyA9IGNoYW5nZXNTdW1tYXJ5LmRlbGV0aW9ucztcblx0XHRcdFx0fSBlbHNlIGlmIChjaGFuZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBjaGFuZ2VzKSB7XG5cdFx0XHRcdFx0XHRpbnNlcnRpb25zICs9IGNoYW5nZS5pbnNlcnRpb25zO1xuXHRcdFx0XHRcdFx0ZGVsZXRpb25zICs9IGNoYW5nZS5kZWxldGlvbnM7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGluc2VydGlvbnMgPiAwIHx8IGRlbGV0aW9ucyA+IDApIHtcblx0XHRcdFx0XHRpZiAocGFydHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0RE9NLmFwcGVuZCh0ZW1wbGF0ZS5kZXRhaWxzUm93LCAkKCdzcGFuLnNlc3Npb24tc2VwYXJhdG9yLmhhcy1zZXBhcmF0b3InKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGRpZmZFbCA9IERPTS5hcHBlbmQodGVtcGxhdGUuZGV0YWlsc1JvdywgJCgnc3Bhbi5zZXNzaW9uLWRpZmYnKSk7XG5cdFx0XHRcdFx0RE9NLmFwcGVuZChkaWZmRWwsICQoJ3NwYW4uc2Vzc2lvbi1kaWZmLWFkZGVkJykpLnRleHRDb250ZW50ID0gYCske2luc2VydGlvbnN9YDtcblx0XHRcdFx0XHRET00uYXBwZW5kKGRpZmZFbCwgJCgnc3Bhbi5zZXNzaW9uLWRpZmYtcmVtb3ZlZCcpKS50ZXh0Q29udGVudCA9IGAtJHtkZWxldGlvbnN9YDtcblx0XHRcdFx0XHRwYXJ0cy5wdXNoKGRpZmZFbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gU3RhdHVzIGRlc2NyaXB0aW9uXG5cdFx0XHRpZiAoc2Vzc2lvblN0YXR1cyA9PT0gU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKSB7XG5cdFx0XHRcdGlmIChwYXJ0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0RE9NLmFwcGVuZCh0ZW1wbGF0ZS5kZXRhaWxzUm93LCAkKCdzcGFuLnNlc3Npb24tc2VwYXJhdG9yLmhhcy1zZXBhcmF0b3InKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc3RhdHVzRWwgPSBET00uYXBwZW5kKHRlbXBsYXRlLmRldGFpbHNSb3csICQoJ3NwYW4uc2Vzc2lvbi1kZXNjcmlwdGlvbicpKTtcblx0XHRcdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb25EaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoZGVzY3JpcHRpb24sIHsgc2FuaXRpemVyQ29uZmlnOiB7IHJlcGxhY2VXaXRoUGxhaW50ZXh0OiB0cnVlIH0gfSwgc3RhdHVzRWwpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0XHRcdHN0YXR1c0VsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3dvcmtpbmcnLCBcIldvcmtpbmcuLi5cIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cGFydHMucHVzaChzdGF0dXNFbCk7XG5cdFx0XHR9IGVsc2UgaWYgKHNlc3Npb25TdGF0dXMgPT09IFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCkge1xuXHRcdFx0XHRpZiAocGFydHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdERPTS5hcHBlbmQodGVtcGxhdGUuZGV0YWlsc1JvdywgJCgnc3Bhbi5zZXNzaW9uLXNlcGFyYXRvci5oYXMtc2VwYXJhdG9yJykpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHN0YXR1c0VsID0gRE9NLmFwcGVuZCh0ZW1wbGF0ZS5kZXRhaWxzUm93LCAkKCdzcGFuLnNlc3Npb24tZGVzY3JpcHRpb24nKSk7XG5cdFx0XHRcdGlmIChkZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uRGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKGRlc2NyaXB0aW9uLCB7IHNhbml0aXplckNvbmZpZzogeyByZXBsYWNlV2l0aFBsYWludGV4dDogdHJ1ZSB9IH0sIHN0YXR1c0VsKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbkRpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdFx0XHRzdGF0dXNFbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCduZWVkc0lucHV0JywgXCJJbnB1dCBuZWVkZWRcIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cGFydHMucHVzaChzdGF0dXNFbCk7XG5cdFx0XHR9IGVsc2UgaWYgKHNlc3Npb25TdGF0dXMgPT09IFNlc3Npb25TdGF0dXMuRXJyb3IpIHtcblx0XHRcdFx0aWYgKHBhcnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRET00uYXBwZW5kKHRlbXBsYXRlLmRldGFpbHNSb3csICQoJ3NwYW4uc2Vzc2lvbi1zZXBhcmF0b3IuaGFzLXNlcGFyYXRvcicpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzdGF0dXNFbCA9IERPTS5hcHBlbmQodGVtcGxhdGUuZGV0YWlsc1JvdywgJCgnc3Bhbi5zZXNzaW9uLWRlc2NyaXB0aW9uJykpO1xuXHRcdFx0XHRpZiAoZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbkRpc3Bvc2FibGUudmFsdWUgPSB0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihkZXNjcmlwdGlvbiwgeyBzYW5pdGl6ZXJDb25maWc6IHsgcmVwbGFjZVdpdGhQbGFpbnRleHQ6IHRydWUgfSB9LCBzdGF0dXNFbCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb25EaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0XHRcdFx0c3RhdHVzRWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZmFpbGVkJywgXCJGYWlsZWRcIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cGFydHMucHVzaChzdGF0dXNFbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkZXNjcmlwdGlvbkRpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGltZXN0YW1wIFx1MjAxNCB2aXNpYmxlIHdoZW4gbm90IGhpZGluZyBkZXRhaWxzXG5cdFx0XHRpZiAoIWhpZGVEZXRhaWxzICYmIHRpbWVEYXRlKSB7XG5cdFx0XHRcdGlmIChwYXJ0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0RE9NLmFwcGVuZCh0ZW1wbGF0ZS5kZXRhaWxzUm93LCAkKCdzcGFuLnNlc3Npb24tc2VwYXJhdG9yLmhhcy1zZXBhcmF0b3InKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdGltZUVsID0gRE9NLmFwcGVuZCh0ZW1wbGF0ZS5kZXRhaWxzUm93LCAkKCdzcGFuLnNlc3Npb24tdGltZScpKTtcblx0XHRcdFx0Y29uc3QgZGVmaW5pdGVUaW1lRGF0ZSA9IHRpbWVEYXRlO1xuXHRcdFx0XHRjb25zdCBmb3JtYXRUaW1lID0gKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHNlY29uZHMgPSBNYXRoLnJvdW5kKChEYXRlLm5vdygpIC0gZGVmaW5pdGVUaW1lRGF0ZS5nZXRUaW1lKCkpIC8gMTAwMCk7XG5cdFx0XHRcdFx0cmV0dXJuIHNlY29uZHMgPCA2MCA/IGxvY2FsaXplKCdzZWNvbmRzRHVyYXRpb24nLCBcIm5vd1wiKSA6IGZyb21Ob3coZGVmaW5pdGVUaW1lRGF0ZSwgdHJ1ZSk7XG5cdFx0XHRcdH07XG5cdFx0XHRcdHRpbWVFbC50ZXh0Q29udGVudCA9IGZvcm1hdFRpbWUoKTtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gRE9NLmdldFdpbmRvdyh0aW1lRWwpO1xuXHRcdFx0XHRjb25zdCBpbnRlcnZhbCA9IHRhcmdldFdpbmRvdy5zZXRJbnRlcnZhbCgoKSA9PiB7XG5cdFx0XHRcdFx0dGltZUVsLnRleHRDb250ZW50ID0gZm9ybWF0VGltZSgpO1xuXHRcdFx0XHR9LCA2MF8wMDApO1xuXHRcdFx0XHR0aW1lRGlzcG9zYWJsZS52YWx1ZSA9IHRvRGlzcG9zYWJsZSgoKSA9PiB0YXJnZXRXaW5kb3cuY2xlYXJJbnRlcnZhbChpbnRlcnZhbCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGltZURpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBBcHByb3ZhbCByb3cgXHUyMDE0IHJlYWN0aXZlXG5cdFx0aWYgKHRoaXMuYXBwcm92YWxNb2RlbCkge1xuXHRcdFx0dGhpcy5yZW5kZXJBcHByb3ZhbFJvdyhlbGVtZW50LCB0ZW1wbGF0ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gRml4LUNJIHJvdyBcdTIwMTQgcmVhY3RpdmUgKG9ubHkgc3VwcGxpZWQgYnkgdGhlIGJsb2NrZWQtc2Vzc2lvbnMgbGlzdClcblx0XHRpZiAodGhpcy5jaUZpeE1vZGVsKSB7XG5cdFx0XHR0aGlzLnJlbmRlckNJUm93KGVsZW1lbnQsIHRlbXBsYXRlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckFwcHJvdmFsUm93KGVsZW1lbnQ6IElTZXNzaW9uLCB0ZW1wbGF0ZTogSVNlc3Npb25JdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuYXBwcm92YWxNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSB0aGlzLmFwcHJvdmFsTW9kZWw7XG5cdFx0Y29uc3QgaW5pdGlhbEluZm8gPSBnZXRGaXJzdEFwcHJvdmFsQWNyb3NzQ2hhdHMoYXBwcm92YWxNb2RlbCwgZWxlbWVudCwgdW5kZWZpbmVkKTtcblx0XHRsZXQgd2FzVmlzaWJsZSA9ICEhaW5pdGlhbEluZm87XG5cdFx0dGVtcGxhdGUuYXBwcm92YWxSb3cuY2xhc3NMaXN0LnRvZ2dsZSgndmlzaWJsZScsIHdhc1Zpc2libGUpO1xuXG5cdFx0Y29uc3QgYnV0dG9uU3RvcmUgPSB0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGJ1dHRvblN0b3JlLmNsZWFyKCk7XG5cblx0XHRcdGNvbnN0IGluZm8gPSBnZXRGaXJzdEFwcHJvdmFsQWNyb3NzQ2hhdHMoYXBwcm92YWxNb2RlbCwgZWxlbWVudCwgcmVhZGVyKTtcblx0XHRcdGNvbnN0IHZpc2libGUgPSAhIWluZm87XG5cblx0XHRcdHRlbXBsYXRlLmFwcHJvdmFsUm93LmNsYXNzTGlzdC50b2dnbGUoJ3Zpc2libGUnLCB2aXNpYmxlKTtcblxuXHRcdFx0aWYgKGluZm8pIHtcblx0XHRcdFx0Ly8gUmVuZGVyIHVwIHRvIGBtYXhMaW5lc2AgbGluZXMgYXMgc2VwYXJhdGUgY29kZSBibG9ja3Ncblx0XHRcdFx0Y29uc3QgbGluZXMgPSBpbmZvLmxhYmVsLnNwbGl0KCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWF4TGluZXMgPSB0aGlzLm9wdGlvbnMuYXBwcm92YWxSb3dNYXhMaW5lcztcblx0XHRcdFx0Y29uc3QgdmlzaWJsZUxpbmVzID0gbGluZXMuc2xpY2UoMCwgbWF4TGluZXMpO1xuXHRcdFx0XHRpZiAobGluZXMubGVuZ3RoID4gbWF4TGluZXMpIHtcblx0XHRcdFx0XHR2aXNpYmxlTGluZXNbbWF4TGluZXMgLSAxXSA9IGAke3Zpc2libGVMaW5lc1ttYXhMaW5lcyAtIDFdfSBcXHUyMDI2YDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBsYW5nSWQgPSBpbmZvLmxhbmd1YWdlSWQgPz8gJ2pzb24nO1xuXHRcdFx0XHRjb25zdCBsYWJlbENvbnRlbnQgPSBuZXcgTWFya2Rvd25TdHJpbmcoKTtcblx0XHRcdFx0Zm9yIChjb25zdCBsaW5lIG9mIHZpc2libGVMaW5lcykge1xuXHRcdFx0XHRcdGxhYmVsQ29udGVudC5hcHBlbmRDb2RlYmxvY2sobGFuZ0lkLCBsaW5lKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRlbXBsYXRlLmFwcHJvdmFsTGFiZWwudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdFx0YnV0dG9uU3RvcmUuYWRkKHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKGxhYmVsQ29udGVudCwge30sIHRlbXBsYXRlLmFwcHJvdmFsTGFiZWwpKTtcblxuXHRcdFx0XHRpZiAodGhpcy5vcHRpb25zLnNob3dIb3Zlcikge1xuXHRcdFx0XHRcdGNvbnN0IGZ1bGxDb250ZW50ID0gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kQ29kZWJsb2NrKGluZm8ubGFuZ3VhZ2VJZCA/PyAnanNvbicsIGluZm8ubGFiZWwpO1xuXHRcdFx0XHRcdGJ1dHRvblN0b3JlLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0ZW1wbGF0ZS5hcHByb3ZhbExhYmVsLCB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiBmdWxsQ29udGVudCxcblx0XHRcdFx0XHRcdHN0eWxlOiBIb3ZlclN0eWxlLlBvaW50ZXIsXG5cdFx0XHRcdFx0XHRwb3NpdGlvbjogeyBob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkJFTE9XIH0sXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGVtcGxhdGUuYXBwcm92YWxCdXR0b25Db250YWluZXIudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdFx0Y29uc3QgYnV0dG9uID0gYnV0dG9uU3RvcmUuYWRkKG5ldyBCdXR0b24odGVtcGxhdGUuYXBwcm92YWxCdXR0b25Db250YWluZXIsIHtcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FsbG93QWN0aW9uT25jZScsIFwiQWxsb3cgb25jZVwiKSxcblx0XHRcdFx0XHRzZWNvbmRhcnk6IHRydWUsXG5cdFx0XHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlc1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdhbGxvd0FjdGlvbicsIFwiQWxsb3dcIik7XG5cdFx0XHRcdGJ1dHRvblN0b3JlLmFkZChidXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gQ2FwdHVyZSB0aGUgYXBwcm92YWwncyBpZGVudGl0eSBCRUZPUkUgY29uZmlybWluZzogYGNvbmZpcm0oKWAgbWF5XG5cdFx0XHRcdFx0Ly8gc3luY2hyb25vdXNseSBjbGVhciB0aGUgcGVuZGluZyBhcHByb3ZhbCwgc28gd2UgY2FuJ3QgcmVhZCBpdCBhZnRlci5cblx0XHRcdFx0XHRjb25zdCBhcHByb3ZhbElkID0gYWdlbnRTZXNzaW9uQXBwcm92YWxJZChpbmZvKTtcblx0XHRcdFx0XHRpbmZvLmNvbmZpcm0oKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZEFwcHJvdmVTZXNzaW9uLmZpcmUoeyBzZXNzaW9uOiBlbGVtZW50LCBhcHByb3ZhbElkIH0pO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh3YXNWaXNpYmxlICE9PSB2aXNpYmxlKSB7XG5cdFx0XHRcdHdhc1Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1IZWlnaHQuZmlyZShlbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNJUm93KGVsZW1lbnQ6IElTZXNzaW9uLCB0ZW1wbGF0ZTogSVNlc3Npb25JdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY2lGaXhNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNpRml4TW9kZWwgPSB0aGlzLmNpRml4TW9kZWw7XG5cdFx0Y29uc3Qgc3RhdGVPYnMgPSBjaUZpeE1vZGVsLmdldENJRml4KGVsZW1lbnQpO1xuXHRcdGxldCB3YXNWaXNpYmxlID0gISFzdGF0ZU9icy5nZXQoKTtcblx0XHR0ZW1wbGF0ZS5jaVJvdy5jbGFzc0xpc3QudG9nZ2xlKCd2aXNpYmxlJywgd2FzVmlzaWJsZSk7XG5cblx0XHRjb25zdCBidXR0b25TdG9yZSA9IHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0YnV0dG9uU3RvcmUuY2xlYXIoKTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB2aXNpYmxlID0gISFzdGF0ZTtcblxuXHRcdFx0dGVtcGxhdGUuY2lSb3cuY2xhc3NMaXN0LnRvZ2dsZSgndmlzaWJsZScsIHZpc2libGUpO1xuXG5cdFx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdFx0dGVtcGxhdGUuY2lMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaS5ibG9ja2VkUm93JywgXCJ7MH0gY2hlY2tzIGZhaWxlZCwgezF9IHBlbmRpbmdcIiwgc3RhdGUuZmFpbGVkLCBzdGF0ZS5wZW5kaW5nKTtcblxuXHRcdFx0XHR0ZW1wbGF0ZS5jaUJ1dHRvbkNvbnRhaW5lci50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0XHQvLyBNYXRjaCB0aGUgY2hhdCBpbnB1dCBDSSBiYW5uZXIncyBwcm9taW5lbnQgb3JhbmdlIGFjdGlvbiBidXR0b24uXG5cdFx0XHRcdGNvbnN0IGJ1dHRvbiA9IGJ1dHRvblN0b3JlLmFkZChuZXcgQnV0dG9uKHRlbXBsYXRlLmNpQnV0dG9uQ29udGFpbmVyLCB7XG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaS5maXhDSVRvb2x0aXAnLCBcIkZpeCBmYWlsaW5nIENJIGNoZWNrc1wiKSxcblx0XHRcdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLFxuXHRcdFx0XHRcdGJ1dHRvbkJhY2tncm91bmQ6IGFzQ3NzVmFyaWFibGUoY2hhcnRzT3JhbmdlKSxcblx0XHRcdFx0XHRidXR0b25Ib3ZlckJhY2tncm91bmQ6IGBjb2xvci1taXgoaW4gc3JnYiwgJHthc0Nzc1ZhcmlhYmxlKGNoYXJ0c09yYW5nZSl9IDg4JSwgYmxhY2spYCxcblx0XHRcdFx0XHRidXR0b25Cb3JkZXI6IGFzQ3NzVmFyaWFibGUoY2hhcnRzT3JhbmdlKSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRidXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnY2kuZml4Q0knLCBcIkZpeCBDSVwiKTtcblx0XHRcdFx0YnV0dG9uU3RvcmUuYWRkKGJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IGNpRml4TW9kZWwuZml4Q0koZWxlbWVudCkpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHdhc1Zpc2libGUgIT09IHZpc2libGUpIHtcblx0XHRcdFx0d2FzVmlzaWJsZSA9IHZpc2libGU7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbUhlaWdodC5maXJlKGVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0V29ya3NwYWNlQmFkZ2VMYWJlbCh3b3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBGb3IgR2l0SHViIHJlbW90ZSBzZXNzaW9ucywgZXh0cmFjdCBvd25lci9uYW1lIGZyb20gdGhlIHJlcG9zaXRvcnkgVVJJIHBhdGhcblx0XHRjb25zdCBmb2xkZXIgPSB3b3Jrc3BhY2UuZm9sZGVyc1swXTtcblx0XHRpZiAoZm9sZGVyPy5yb290LnNjaGVtZSA9PT0gR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRSkge1xuXHRcdFx0Y29uc3QgcGFydHMgPSBmb2xkZXIucm9vdC5wYXRoLnNwbGl0KCcvJykuZmlsdGVyKEJvb2xlYW4pO1xuXHRcdFx0aWYgKHBhcnRzLmxlbmd0aCA+PSAyKSB7XG5cdFx0XHRcdHJldHVybiBgJHtwYXJ0c1swXX0vJHtwYXJ0c1sxXX1gO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB3b3Jrc3BhY2UubGFiZWw7XG5cdH1cblxuXHRzdGFydEFyY2hpdmVBbmltYXRpb24oc2Vzc2lvbjogSVNlc3Npb24sIG92ZXJsYXlIb3N0OiBIVE1MRWxlbWVudCk6IElTZXNzaW9uQXJjaGl2ZUFuaW1hdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSB0aGlzLl90ZW1wbGF0ZXNCeVNlc3Npb24uZ2V0KHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0aWYgKCF0ZW1wbGF0ZSB8fCAhdGVtcGxhdGUudGl0bGVUb29sYmFyIHx8IHRlbXBsYXRlLmNvbnRhaW5lci5vd25lckRvY3VtZW50LnZpc2liaWxpdHlTdGF0ZSA9PT0gJ2hpZGRlbicgfHwgdGVtcGxhdGUuYXJjaGl2ZUFuaW1hdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdG9vbGJhckJvdW5kcyA9IHRlbXBsYXRlLnRpdGxlVG9vbGJhci5nZXRFbGVtZW50KCkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0bGV0IGl0ZW1PZmZzZXQgPSAwO1xuXHRcdGxldCBhcmNoaXZlQWN0aW9uQm91bmRzOiB7IGxlZnQ6IG51bWJlcjsgdG9wOiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHRlbXBsYXRlLnRpdGxlVG9vbGJhci5nZXRJdGVtc0xlbmd0aCgpOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCBpdGVtV2lkdGggPSB0ZW1wbGF0ZS50aXRsZVRvb2xiYXIuZ2V0SXRlbVdpZHRoKGluZGV4KTtcblx0XHRcdGlmICh0ZW1wbGF0ZS50aXRsZVRvb2xiYXIuZ2V0SXRlbUFjdGlvbihpbmRleCk/LmlkID09PSBBUkNISVZFX1NFU1NJT05fQ09NTUFORF9JRCkge1xuXHRcdFx0XHRhcmNoaXZlQWN0aW9uQm91bmRzID0ge1xuXHRcdFx0XHRcdGxlZnQ6IHRvb2xiYXJCb3VuZHMubGVmdCArIGl0ZW1PZmZzZXQsXG5cdFx0XHRcdFx0dG9wOiB0b29sYmFyQm91bmRzLnRvcCxcblx0XHRcdFx0XHR3aWR0aDogaXRlbVdpZHRoLFxuXHRcdFx0XHRcdGhlaWdodDogdG9vbGJhckJvdW5kcy5oZWlnaHQsXG5cdFx0XHRcdH07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aXRlbU9mZnNldCArPSBpdGVtV2lkdGg7XG5cdFx0fVxuXHRcdGlmICghYXJjaGl2ZUFjdGlvbkJvdW5kcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGVtcGxhdGUuYXJjaGl2ZUFuaW1hdGlvbiA9IGNyZWF0ZVNlc3Npb25BcmNoaXZlQW5pbWF0aW9uKHRlbXBsYXRlLmNvbnRhaW5lciwgYXJjaGl2ZUFjdGlvbkJvdW5kcywgb3ZlcmxheUhvc3QpO1xuXHRcdHJldHVybiB0ZW1wbGF0ZS5hcmNoaXZlQW5pbWF0aW9uO1xuXHR9XG5cblx0Y2xlYXJBcmNoaXZlQW5pbWF0aW9uKHNlc3Npb246IElTZXNzaW9uLCBhbmltYXRpb246IElTZXNzaW9uQXJjaGl2ZUFuaW1hdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IHRlbXBsYXRlID0gdGhpcy5fdGVtcGxhdGVzQnlTZXNzaW9uLmdldChzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGlmICh0ZW1wbGF0ZT8uYXJjaGl2ZUFuaW1hdGlvbiA9PT0gYW5pbWF0aW9uKSB7XG5cdFx0XHR0ZW1wbGF0ZS5hcmNoaXZlQW5pbWF0aW9uID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRhbmltYXRpb24uZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBiaW5kVGVtcGxhdGVUb1Nlc3Npb24odGVtcGxhdGU6IElTZXNzaW9uSXRlbVRlbXBsYXRlLCBzZXNzaW9uOiBJU2Vzc2lvbik6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRpZiAodGVtcGxhdGUuc2Vzc2lvblJlc291cmNlID09PSBzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy51bmJpbmRUZW1wbGF0ZSh0ZW1wbGF0ZSk7XG5cdFx0dGVtcGxhdGUuc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdHRoaXMuX3RlbXBsYXRlc0J5U2Vzc2lvbi5zZXQoc2Vzc2lvblJlc291cmNlLCB0ZW1wbGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIHVuYmluZFRlbXBsYXRlKHRlbXBsYXRlOiBJU2Vzc2lvbkl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGlmICh0ZW1wbGF0ZS5zZXNzaW9uUmVzb3VyY2UgJiYgdGhpcy5fdGVtcGxhdGVzQnlTZXNzaW9uLmdldCh0ZW1wbGF0ZS5zZXNzaW9uUmVzb3VyY2UpID09PSB0ZW1wbGF0ZSkge1xuXHRcdFx0dGhpcy5fdGVtcGxhdGVzQnlTZXNzaW9uLmRlbGV0ZSh0ZW1wbGF0ZS5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH1cblx0XHR0ZW1wbGF0ZS5zZXNzaW9uUmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0dGVtcGxhdGUuYXJjaGl2ZUFuaW1hdGlvbj8uZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlLmFyY2hpdmVBbmltYXRpb24gPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChub2RlOiBJVHJlZU5vZGU8U2Vzc2lvbkxpc3RJdGVtLCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBJU2Vzc2lvbkl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMudW5iaW5kVGVtcGxhdGUodGVtcGxhdGUpO1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlOiBJU2Vzc2lvbkl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMudW5iaW5kVGVtcGxhdGUodGVtcGxhdGUpO1xuXHRcdHRlbXBsYXRlLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFNlY3Rpb24gSGVhZGVyIFJlbmRlcmVyXG5cbmludGVyZmFjZSBJU2Vzc2lvblNlY3Rpb25UZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGljb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBzdGF0dXNJbmRpY2F0b3I6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBsYWJlbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGNvdW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgdG9vbGJhcjogTWVudVdvcmtiZW5jaFRvb2xCYXI7XG5cdHJlYWRvbmx5IGNoZXZyb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgU2Vzc2lvblNlY3Rpb25SZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8U2Vzc2lvbkxpc3RJdGVtLCBGdXp6eVNjb3JlLCBJU2Vzc2lvblNlY3Rpb25UZW1wbGF0ZT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnc2Vzc2lvbi1zZWN0aW9uJztcblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IFNlc3Npb25TZWN0aW9uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSB0ZW1wbGF0ZXNCeUVsZW1lbnQgPSBuZXcgV2Vha01hcDxJU2Vzc2lvblNlY3Rpb24sIElTZXNzaW9uU2VjdGlvblRlbXBsYXRlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRlbXBsYXRlc0J5SWQgPSBuZXcgTWFwPHN0cmluZywgSVNlc3Npb25TZWN0aW9uVGVtcGxhdGU+KCk7XG5cdHJlYWRvbmx5IGF1dG9tYXRpb25TdGF0dXMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgcnVucyA9IHRoaXMuYXV0b21hdGlvblNlcnZpY2UucnVucy5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKHJ1bnMuc29tZShydW4gPT4gcnVuLnN0YXR1cyA9PT0gJ3BlbmRpbmcnIHx8IHJ1bi5zdGF0dXMgPT09ICdydW5uaW5nJykpIHtcblx0XHRcdHJldHVybiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3M7XG5cdFx0fVxuXHRcdGNvbnN0IGhhc1VucmVhZFJ1biA9IHJ1bnMuc29tZShydW4gPT4ge1xuXHRcdFx0aWYgKChydW4uc3RhdHVzICE9PSAnY29tcGxldGVkJyAmJiBydW4uc3RhdHVzICE9PSAnZmFpbGVkJykgfHwgIXJ1bi5zZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uKFVSSS5wYXJzZShydW4uc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0XHRyZXR1cm4gISFzZXNzaW9uICYmICFzZXNzaW9uLmlzUmVhZC5yZWFkKHJlYWRlcik7XG5cdFx0fSk7XG5cdFx0aWYgKGhhc1VucmVhZFJ1bikge1xuXHRcdFx0cmV0dXJuIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9KTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhpZGVTZWN0aW9uQ291bnQ6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25TZXJ2aWNlOiBJQXV0b21hdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGN1c3RvbVZpZXdTZXJ2aWNlOiBJQ3VzdG9tVmlld1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTZXNzaW9uU2VjdGlvblRlbXBsYXRlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdzZXNzaW9uLXNlY3Rpb24nKTtcblx0XHRjb25zdCBpY29uID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJ3NwYW4uc2Vzc2lvbi1zZWN0aW9uLWljb24nKSk7XG5cdFx0aWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRjb25zdCBsYWJlbCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLnNlc3Npb24tc2VjdGlvbi1sYWJlbCcpKTtcblx0XHRjb25zdCBzdGF0dXNJbmRpY2F0b3IgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnc3Bhbi5zZXNzaW9uLXNlY3Rpb24tc3RhdHVzLWluZGljYXRvcicpKTtcblx0XHRzdGF0dXNJbmRpY2F0b3Iuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0Y29uc3QgY291bnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnc3Bhbi5zZXNzaW9uLXNlY3Rpb24tY291bnQnKSk7XG5cdFx0Y29uc3QgdG9vbGJhckNvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2Vzc2lvbi1zZWN0aW9uLXRvb2xiYXInKSk7XG5cdFx0Y29uc3QgY2hldnJvbiA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLnNlc3Npb24tc2VjdGlvbi1jaGV2cm9uJykpO1xuXHRcdGNoZXZyb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChjb250YWluZXIpKTtcblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZV0pKSk7XG5cdFx0Y29uc3QgdG9vbGJhciA9IGRpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdG9vbGJhckNvbnRhaW5lciwgU2Vzc2lvblNlY3Rpb25Ub29sYmFyTWVudUlkLCB7XG5cdFx0XHRtZW51T3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9LFxuXHRcdH0pKTtcblxuXHRcdHJldHVybiB7IGNvbnRhaW5lciwgaWNvbiwgc3RhdHVzSW5kaWNhdG9yLCBsYWJlbCwgY291bnQsIHRvb2xiYXIsIGNoZXZyb24sIGNvbnRleHRLZXlTZXJ2aWNlLCBkaXNwb3NhYmxlcywgZWxlbWVudERpc3Bvc2FibGVzIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxTZXNzaW9uTGlzdEl0ZW0sIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IElTZXNzaW9uU2VjdGlvblRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IG5vZGUuZWxlbWVudDtcblx0XHRpZiAoIWlzU2Vzc2lvblNlY3Rpb24oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy50ZW1wbGF0ZXNCeUVsZW1lbnQuc2V0KGVsZW1lbnQsIHRlbXBsYXRlKTtcblx0XHR0aGlzLnRlbXBsYXRlc0J5SWQuc2V0KGVsZW1lbnQuaWQsIHRlbXBsYXRlKTtcblx0XHR0ZW1wbGF0ZS5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShTRVNTSU9OX0hFQURFUl9EUk9QX1RBUkdFVF9DTEFTUyk7XG5cdFx0dGVtcGxhdGUuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3Nlc3Npb24tc2VjdGlvbi1zaG9ydGN1dCcpO1xuXHRcdGlmIChlbGVtZW50LmlkID09PSBBVVRPTUFUSU9OU19TRUNUSU9OX0lEKSB7XG5cdFx0XHR0ZW1wbGF0ZS5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc2Vzc2lvbi1zZWN0aW9uLXNob3J0Y3V0Jyk7XG5cdFx0fVxuXG5cdFx0Ly8gTGVhZGluZyBpY29uIGZvciB0aGUgXCJQaW5uZWRcIiBhbmQgXCJDaGF0c1wiIChxdWljayBjaGF0cykgc2VjdGlvbiBoZWFkZXJzLlxuXHRcdC8vIFRlbXBsYXRlcyBhcmUgcmV1c2VkIGFjcm9zcyByb3dzLCBzbyByZWNvbXB1dGUgdGhlIGljb24gZXZlcnkgcmVuZGVyLlxuXHRcdGNvbnN0IHNlY3Rpb25JY29uID0gZWxlbWVudC5pZCA9PT0gUVVJQ0tfQ0hBVFNfU0VDVElPTl9JRCA/IENvZGljb24uY29tbWVudERpc2N1c3Npb25cblx0XHRcdDogZWxlbWVudC5pZCA9PT0gJ3Bpbm5lZCcgPyBDb2RpY29uLnBpbm5lZFxuXHRcdFx0XHQ6IGVsZW1lbnQuaWQgPT09IEFVVE9NQVRJT05TX1NFQ1RJT05fSUQgPyBDb2RpY29uLndhdGNoXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0dGVtcGxhdGUuaWNvbi5jbGFzc05hbWUgPSBzZWN0aW9uSWNvbiA/IGBzZXNzaW9uLXNlY3Rpb24taWNvbiAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShzZWN0aW9uSWNvbil9YCA6ICdzZXNzaW9uLXNlY3Rpb24taWNvbic7XG5cdFx0dGVtcGxhdGUuaWNvbi5zdHlsZS5kaXNwbGF5ID0gc2VjdGlvbkljb24gPyAnJyA6ICdub25lJztcblxuXHRcdGlmIChlbGVtZW50LmlkID09PSBBVVRPTUFUSU9OU19TRUNUSU9OX0lEKSB7XG5cdFx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlQ3VzdG9tVmlldyA9IHRoaXMuY3VzdG9tVmlld1NlcnZpY2UuYWN0aXZlQ3VzdG9tVmlldy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHRlbXBsYXRlLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBhY3RpdmVDdXN0b21WaWV3Py5pZCA9PT0gQVVUT01BVElPTlNfQ1VTVE9NX1ZJRVdfSUQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0RE9NLmNsZWFyTm9kZSh0ZW1wbGF0ZS5zdGF0dXNJbmRpY2F0b3IpO1xuXHRcdFx0Y29uc3Qgc3RhdHVzSWNvbiA9IHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uU3RhdHVzSWNvbiwgdGVtcGxhdGUuc3RhdHVzSW5kaWNhdG9yKSk7XG5cdFx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgYXV0b21hdGlvblN0YXR1cyA9IHRoaXMuYXV0b21hdGlvblN0YXR1cy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChhdXRvbWF0aW9uU3RhdHVzID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpIHtcblx0XHRcdFx0XHR0ZW1wbGF0ZS5zdGF0dXNJbmRpY2F0b3Iuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHRcdHN0YXR1c0ljb24uc2V0U3RhdHVzKFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcywgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGF1dG9tYXRpb25TdGF0dXMgPT09IFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKSB7XG5cdFx0XHRcdFx0dGVtcGxhdGUuc3RhdHVzSW5kaWNhdG9yLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0XHRzdGF0dXNJY29uLnNldFN0YXR1cyhTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgZmFsc2UsIGZhbHNlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0ZW1wbGF0ZS5zdGF0dXNJbmRpY2F0b3Iuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZS5zdGF0dXNJbmRpY2F0b3Iuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdERPTS5jbGVhck5vZGUodGVtcGxhdGUuc3RhdHVzSW5kaWNhdG9yKTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZS5sYWJlbC50ZXh0Q29udGVudCA9IGVsZW1lbnQubGFiZWw7XG5cdFx0aWYgKHRoaXMuaGlkZVNlY3Rpb25Db3VudCB8fCBlbGVtZW50LmlkID09PSBBVVRPTUFUSU9OU19TRUNUSU9OX0lEKSB7XG5cdFx0XHR0ZW1wbGF0ZS5jb3VudC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0dGVtcGxhdGUuY291bnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGUuY291bnQudGV4dENvbnRlbnQgPSBTdHJpbmcoZWxlbWVudC5zZXNzaW9ucy5sZW5ndGgpO1xuXHRcdFx0dGVtcGxhdGUuY291bnQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlQ2hldnJvbih0ZW1wbGF0ZSwgbm9kZS5jb2xsYXBzaWJsZSwgbm9kZS5jb2xsYXBzZWQpO1xuXG5cdFx0Ly8gU2V0IGNvbnRleHQga2V5IGZvciBzZWN0aW9uIHR5cGUgc28gdG9vbGJhciBhY3Rpb25zIGNhbiB1c2Ugd2hlbiBjbGF1c2VzXG5cdFx0Y29uc3Qgc2VjdGlvblR5cGUgPSBlbGVtZW50LmlkLnN0YXJ0c1dpdGgoJ3dvcmtzcGFjZTonKSA/ICd3b3Jrc3BhY2UnIDogZWxlbWVudC5pZDtcblx0XHRTZXNzaW9uU2VjdGlvblR5cGVDb250ZXh0LmJpbmRUbyh0ZW1wbGF0ZS5jb250ZXh0S2V5U2VydmljZSkuc2V0KHNlY3Rpb25UeXBlKTtcblx0XHR0ZW1wbGF0ZS50b29sYmFyLmNvbnRleHQgPSBlbGVtZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIGV4cGFuZC9jb2xsYXBzZSBjaGV2cm9uIGZvciBhbiBhbHJlYWR5LXJlbmRlcmVkIHNlY3Rpb24uIFRoZVxuXHQgKiB0cmVlIG9ubHkgcmUtaW52b2tlcyBgcmVuZGVyVHdpc3RpZWAgKG5vdCBgcmVuZGVyRWxlbWVudGApIHdoZW4gYSBzZWN0aW9uJ3Ncblx0ICogY29sbGFwc2Ugc3RhdGUgdG9nZ2xlcywgc28gdGhlIG93bmluZyBsaXN0IGZvcndhcmRzIGNvbGxhcHNlIGNoYW5nZXMgaGVyZS5cblx0ICovXG5cdHVwZGF0ZUNvbGxhcHNlU3RhdGUoZWxlbWVudDogSVNlc3Npb25TZWN0aW9uLCBjb2xsYXBzZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCB0ZW1wbGF0ZSA9IHRoaXMudGVtcGxhdGVzQnlFbGVtZW50LmdldChlbGVtZW50KTtcblx0XHRpZiAodGVtcGxhdGUpIHtcblx0XHRcdHRoaXMudXBkYXRlQ2hldnJvbih0ZW1wbGF0ZSwgdHJ1ZSwgY29sbGFwc2VkKTtcblx0XHR9XG5cdH1cblxuXHRzZXREcm9wVGFyZ2V0KHNlY3Rpb25JZDogc3RyaW5nLCBhY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCB0ZW1wbGF0ZSA9IHRoaXMudGVtcGxhdGVzQnlJZC5nZXQoc2VjdGlvbklkKTtcblx0XHR0ZW1wbGF0ZT8uY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoU0VTU0lPTl9IRUFERVJfRFJPUF9UQVJHRVRfQ0xBU1MsIGFjdGl2ZSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNoZXZyb24odGVtcGxhdGU6IElTZXNzaW9uU2VjdGlvblRlbXBsYXRlLCBjb2xsYXBzaWJsZTogYm9vbGVhbiwgY29sbGFwc2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuY2hldnJvbi5jbGFzc05hbWUgPSAnc2Vzc2lvbi1zZWN0aW9uLWNoZXZyb24nO1xuXHRcdGlmIChjb2xsYXBzaWJsZSkge1xuXHRcdFx0dGVtcGxhdGUuY2hldnJvbi5jbGFzc0xpc3QuYWRkKCdjb2xsYXBzaWJsZScpO1xuXHRcdFx0Y29uc3QgaWNvbiA9IGNvbGxhcHNlZCA/IENvZGljb24uY2hldnJvblJpZ2h0IDogQ29kaWNvbi5jaGV2cm9uRG93bjtcblx0XHRcdHRlbXBsYXRlLmNoZXZyb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShpY29uKSk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQobm9kZTogSVRyZWVOb2RlPFNlc3Npb25MaXN0SXRlbSwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogSVNlc3Npb25TZWN0aW9uVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRpZiAoaXNTZXNzaW9uU2VjdGlvbihub2RlLmVsZW1lbnQpKSB7XG5cdFx0XHR0aGlzLnRlbXBsYXRlc0J5RWxlbWVudC5kZWxldGUobm9kZS5lbGVtZW50KTtcblx0XHRcdHRoaXMudGVtcGxhdGVzQnlJZC5kZWxldGUobm9kZS5lbGVtZW50LmlkKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGU6IElTZXNzaW9uU2VjdGlvblRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gU2Vzc2lvbiBHcm91cCBSZW5kZXJlclxuXG5pbnRlcmZhY2UgSVNlc3Npb25Hcm91cFRlbXBsYXRlIHtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgbGFiZWw6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBpbnB1dENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHRvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXHRyZWFkb25seSBjaGV2cm9uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbi8qKlxuICogQ2FsbGJhY2tzIHRoZSBncm91cCByZW5kZXJlciB1c2VzIHRvIGNvbW1pdCBvciBjYW5jZWwgaW5saW5lIHJlbmFtaW5nLlxuICovXG5pbnRlcmZhY2UgSVNlc3Npb25Hcm91cFJlbmRlcmVyRGVsZWdhdGUge1xuXHRjb21taXRFZGl0KGdyb3VwOiBJU2Vzc2lvbkdyb3VwLCBuYW1lOiBzdHJpbmcpOiB2b2lkO1xuXHRjYW5jZWxFZGl0KGdyb3VwOiBJU2Vzc2lvbkdyb3VwKTogdm9pZDtcbn1cblxuY2xhc3MgU2Vzc2lvbkdyb3VwUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNlc3Npb25MaXN0SXRlbSwgRnV6enlTY29yZSwgSVNlc3Npb25Hcm91cFRlbXBsYXRlPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdzZXNzaW9uLWdyb3VwJztcblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IFNlc3Npb25Hcm91cFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdGVtcGxhdGVzQnlFbGVtZW50ID0gbmV3IFdlYWtNYXA8SVNlc3Npb25Hcm91cEl0ZW0sIElTZXNzaW9uR3JvdXBUZW1wbGF0ZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB0ZW1wbGF0ZXNCeUlkID0gbmV3IE1hcDxzdHJpbmcsIElTZXNzaW9uR3JvdXBUZW1wbGF0ZT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRlbGVnYXRlOiBJU2Vzc2lvbkdyb3VwUmVuZGVyZXJEZWxlZ2F0ZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2Vzc2lvbkdyb3VwVGVtcGxhdGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Nlc3Npb24tc2VjdGlvbicsICdzZXNzaW9uLWdyb3VwJyk7XG5cdFx0Y29uc3QgbGFiZWwgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnc3Bhbi5zZXNzaW9uLXNlY3Rpb24tbGFiZWwnKSk7XG5cdFx0Y29uc3QgaW5wdXRDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNlc3Npb24tZ3JvdXAtaW5wdXQnKSk7XG5cdFx0Y29uc3QgdG9vbGJhckNvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2Vzc2lvbi1zZWN0aW9uLXRvb2xiYXInKSk7XG5cdFx0Y29uc3QgY2hldnJvbiA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLnNlc3Npb24tc2VjdGlvbi1jaGV2cm9uJykpO1xuXHRcdGNoZXZyb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChjb250YWluZXIpKTtcblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZV0pKSk7XG5cdFx0Y29uc3QgdG9vbGJhciA9IGRpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdG9vbGJhckNvbnRhaW5lciwgU2Vzc2lvbkdyb3VwVG9vbGJhck1lbnVJZCwge1xuXHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4geyBjb250YWluZXIsIGxhYmVsLCBpbnB1dENvbnRhaW5lciwgdG9vbGJhciwgY2hldnJvbiwgY29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLCBlbGVtZW50RGlzcG9zYWJsZXM6IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxTZXNzaW9uTGlzdEl0ZW0sIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IElTZXNzaW9uR3JvdXBUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0aWYgKCFpc1Nlc3Npb25Hcm91cEl0ZW0oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy50ZW1wbGF0ZXNCeUVsZW1lbnQuc2V0KGVsZW1lbnQsIHRlbXBsYXRlKTtcblx0XHR0aGlzLnRlbXBsYXRlc0J5SWQuc2V0KGVsZW1lbnQuZ3JvdXAuaWQsIHRlbXBsYXRlKTtcblx0XHR0ZW1wbGF0ZS5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShTRVNTSU9OX0hFQURFUl9EUk9QX1RBUkdFVF9DTEFTUyk7XG5cblx0XHR0ZW1wbGF0ZS5sYWJlbC50ZXh0Q29udGVudCA9IGVsZW1lbnQuZ3JvdXAubmFtZTtcblx0XHR0aGlzLnVwZGF0ZUNoZXZyb24odGVtcGxhdGUsIG5vZGUuY29sbGFwc2libGUsIG5vZGUuY29sbGFwc2VkKTtcblx0XHRTZXNzaW9uR3JvdXBIYXNWaXNpYmxlU2Vzc2lvbnNDb250ZXh0LmJpbmRUbyh0ZW1wbGF0ZS5jb250ZXh0S2V5U2VydmljZSkuc2V0KGVsZW1lbnQuc2Vzc2lvbnMubGVuZ3RoID4gMCk7XG5cdFx0U2Vzc2lvbkdyb3VwSXNFbXB0eUNvbnRleHQuYmluZFRvKHRlbXBsYXRlLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoZWxlbWVudC5pc0VtcHR5KTtcblx0XHR0ZW1wbGF0ZS50b29sYmFyLmNvbnRleHQgPSBlbGVtZW50O1xuXG5cdFx0dGVtcGxhdGUuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3Nlc3Npb24tZ3JvdXAtZWRpdGluZycsIGVsZW1lbnQuZWRpdGluZyk7XG5cdFx0aWYgKGVsZW1lbnQuZWRpdGluZykge1xuXHRcdFx0dGhpcy5yZW5kZXJJbnB1dChlbGVtZW50LCB0ZW1wbGF0ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlLmlucHV0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0ZW1wbGF0ZS5sYWJlbC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJJbnB1dChlbGVtZW50OiBJU2Vzc2lvbkdyb3VwSXRlbSwgdGVtcGxhdGU6IElTZXNzaW9uR3JvdXBUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlLmxhYmVsLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGVtcGxhdGUuaW5wdXRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdERPTS5jbGVhck5vZGUodGVtcGxhdGUuaW5wdXRDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSB0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBJbnB1dEJveCh0ZW1wbGF0ZS5pbnB1dENvbnRhaW5lciwgdW5kZWZpbmVkLCB7XG5cdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnc2Vzc2lvbkdyb3VwTmFtZScsIFwiR3JvdXAgbmFtZVwiKSxcblx0XHR9KSk7XG5cdFx0aW5wdXQudmFsdWUgPSBlbGVtZW50Lmdyb3VwLm5hbWU7XG5cdFx0aW5wdXQuZm9jdXMoKTtcblx0XHRpbnB1dC5zZWxlY3QoKTtcblxuXHRcdGxldCBkb25lID0gZmFsc2U7XG5cdFx0Y29uc3QgY29tbWl0ID0gKCkgPT4ge1xuXHRcdFx0aWYgKGRvbmUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZG9uZSA9IHRydWU7XG5cdFx0XHR0aGlzLmRlbGVnYXRlLmNvbW1pdEVkaXQoZWxlbWVudC5ncm91cCwgaW5wdXQudmFsdWUudHJpbSgpKTtcblx0XHR9O1xuXHRcdGNvbnN0IGNhbmNlbCA9ICgpID0+IHtcblx0XHRcdGlmIChkb25lKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0dGhpcy5kZWxlZ2F0ZS5jYW5jZWxFZGl0KGVsZW1lbnQuZ3JvdXApO1xuXHRcdH07XG5cblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKERPTS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dC5pbnB1dEVsZW1lbnQsIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0Y29tbWl0KCk7XG5cdFx0XHR9IGVsc2UgaWYgKGUuZXF1YWxzKEtleUNvZGUuRXNjYXBlKSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGNhbmNlbCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoaW5wdXQuaW5wdXRFbGVtZW50LCBET00uRXZlbnRUeXBlLkJMVVIsICgpID0+IGNvbW1pdCgpKSk7XG5cdH1cblxuXHQvKiogRm9yd2FyZGVkIGZyb20gdGhlIG93bmluZyBsaXN0IHdoZW4gdGhlIGdyb3VwJ3MgY29sbGFwc2Ugc3RhdGUgdG9nZ2xlcy4gKi9cblx0dXBkYXRlQ29sbGFwc2VTdGF0ZShlbGVtZW50OiBJU2Vzc2lvbkdyb3VwSXRlbSwgY29sbGFwc2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSB0aGlzLnRlbXBsYXRlc0J5RWxlbWVudC5nZXQoZWxlbWVudCk7XG5cdFx0aWYgKHRlbXBsYXRlKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNoZXZyb24odGVtcGxhdGUsIHRydWUsIGNvbGxhcHNlZCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0RHJvcFRhcmdldChncm91cElkOiBzdHJpbmcsIGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHRlbXBsYXRlID0gdGhpcy50ZW1wbGF0ZXNCeUlkLmdldChncm91cElkKTtcblx0XHR0ZW1wbGF0ZT8uY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoU0VTU0lPTl9IRUFERVJfRFJPUF9UQVJHRVRfQ0xBU1MsIGFjdGl2ZSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNoZXZyb24odGVtcGxhdGU6IElTZXNzaW9uR3JvdXBUZW1wbGF0ZSwgY29sbGFwc2libGU6IGJvb2xlYW4sIGNvbGxhcHNlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRlbXBsYXRlLmNoZXZyb24uY2xhc3NOYW1lID0gJ3Nlc3Npb24tc2VjdGlvbi1jaGV2cm9uJztcblx0XHRpZiAoY29sbGFwc2libGUpIHtcblx0XHRcdHRlbXBsYXRlLmNoZXZyb24uY2xhc3NMaXN0LmFkZCgnY29sbGFwc2libGUnKTtcblx0XHRcdGNvbnN0IGljb24gPSBjb2xsYXBzZWQgPyBDb2RpY29uLmNoZXZyb25SaWdodCA6IENvZGljb24uY2hldnJvbkRvd247XG5cdFx0XHR0ZW1wbGF0ZS5jaGV2cm9uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoaWNvbikpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxTZXNzaW9uTGlzdEl0ZW0sIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IElTZXNzaW9uR3JvdXBUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGlmIChpc1Nlc3Npb25Hcm91cEl0ZW0obm9kZS5lbGVtZW50KSkge1xuXHRcdFx0dGhpcy50ZW1wbGF0ZXNCeUVsZW1lbnQuZGVsZXRlKG5vZGUuZWxlbWVudCk7XG5cdFx0XHR0aGlzLnRlbXBsYXRlc0J5SWQuZGVsZXRlKG5vZGUuZWxlbWVudC5ncm91cC5pZCk7XG5cdFx0fVxuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlOiBJU2Vzc2lvbkdyb3VwVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBTaG93IE1vcmUgUmVuZGVyZXJcblxuY2xhc3MgU2Vzc2lvblNob3dNb3JlUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNlc3Npb25MaXN0SXRlbSwgRnV6enlTY29yZSwgSFRNTEVsZW1lbnQ+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ3Nlc3Npb24tc2hvdy1tb3JlJztcblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IFNlc3Npb25TaG93TW9yZVJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Nlc3Npb24tc2hvdy1tb3JlJyk7XG5cdFx0cmV0dXJuIERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLnNlc3Npb24tc2hvdy1tb3JlLWxhYmVsJykpO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8U2Vzc2lvbkxpc3RJdGVtLCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0aWYgKCFpc1Nlc3Npb25TaG93TW9yZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb250YWluZXIgPSB0ZW1wbGF0ZS5wYXJlbnRFbGVtZW50O1xuXHRcdGNvbnRhaW5lcj8uY2xhc3NMaXN0LnRvZ2dsZSgnc2Vzc2lvbi1zaG93LW1vcmUtZm9sZGVycycsIGVsZW1lbnQua2luZCA9PT0gJ2ZvbGRlcnMnKTtcblx0XHRpZiAoZWxlbWVudC5tb2RlID09PSAnbGVzcycpIHtcblx0XHRcdHRlbXBsYXRlLnRleHRDb250ZW50ID0gZWxlbWVudC5raW5kID09PSAnZm9sZGVycydcblx0XHRcdFx0PyBsb2NhbGl6ZSgnc2hvd0xlc3NXb3Jrc3BhY2VzQ29tcGFjdCcsIFwiU2hvdyBmZXdlciB3b3Jrc3BhY2VzXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3Nob3dMZXNzQ29tcGFjdCcsIFwiU2hvdyBsZXNzXCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZS50ZXh0Q29udGVudCA9IGVsZW1lbnQua2luZCA9PT0gJ2ZvbGRlcnMnXG5cdFx0XHRcdD8gZWxlbWVudC5yZW1haW5pbmdDb3VudCA9PT0gMVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ3Nob3dNb3JlV29ya3NwYWNlQ29tcGFjdCcsIFwiK3swfSBtb3JlIHdvcmtzcGFjZVwiLCBlbGVtZW50LnJlbWFpbmluZ0NvdW50KVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ3Nob3dNb3JlV29ya3NwYWNlc0NvbXBhY3QnLCBcIit7MH0gbW9yZSB3b3Jrc3BhY2VzXCIsIGVsZW1lbnQucmVtYWluaW5nQ291bnQpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3Nob3dNb3JlQ29tcGFjdCcsIFwiK3swfSBtb3JlXCIsIGVsZW1lbnQucmVtYWluaW5nQ291bnQpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZShfdGVtcGxhdGU6IEhUTUxFbGVtZW50KTogdm9pZCB7IH1cbn1cblxuaW50ZXJmYWNlIElTZXNzaW9uUGxhY2Vob2xkZXJUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxhYmVsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaG92ZXI6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPjtcbn1cblxuY2xhc3MgU2Vzc2lvblBsYWNlaG9sZGVyUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNlc3Npb25MaXN0SXRlbSwgRnV6enlTY29yZSwgSVNlc3Npb25QbGFjZWhvbGRlclRlbXBsYXRlPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdzZXNzaW9uLXBsYWNlaG9sZGVyJztcblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IFNlc3Npb25QbGFjZWhvbGRlclJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2Vzc2lvblBsYWNlaG9sZGVyVGVtcGxhdGUge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdzZXNzaW9uLXBsYWNlaG9sZGVyJyk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdGxhYmVsOiBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnc3Bhbi5zZXNzaW9uLXBsYWNlaG9sZGVyLWxhYmVsJykpLFxuXHRcdFx0aG92ZXI6IG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpLFxuXHRcdH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxTZXNzaW9uTGlzdEl0ZW0sIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IElTZXNzaW9uUGxhY2Vob2xkZXJUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0aWYgKCFpc1Nlc3Npb25QbGFjZWhvbGRlcihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0ZW1wbGF0ZS5sYWJlbC50ZXh0Q29udGVudCA9IGVsZW1lbnQubGFiZWw7XG5cdFx0dGVtcGxhdGUuaG92ZXIudmFsdWUgPSBlbGVtZW50LmhvdmVyXG5cdFx0XHQ/IHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHRlbXBsYXRlLmNvbnRhaW5lciwgZWxlbWVudC5ob3Zlcilcblx0XHRcdDogdW5kZWZpbmVkO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlOiBJU2Vzc2lvblBsYWNlaG9sZGVyVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS5ob3Zlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLy8jcmVnaW9uIEFjY2Vzc2liaWxpdHlcblxuY2xhc3MgU2Vzc2lvbnNBY2Nlc3NpYmlsaXR5UHJvdmlkZXIge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25TdGF0dXM/OiBJT2JzZXJ2YWJsZTxTZXNzaW9uU3RhdHVzIHwgdW5kZWZpbmVkPikgeyB9XG5cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdzZXNzaW9uc0xpc3QnLCBcIlNlc3Npb25zXCIpO1xuXHR9XG5cblx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IFNlc3Npb25MaXN0SXRlbSk6IHN0cmluZyB8IElPYnNlcnZhYmxlPHN0cmluZz4gfCBudWxsIHtcblx0XHRpZiAoaXNTZXNzaW9uR3JvdXBJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gYCR7ZWxlbWVudC5ncm91cC5uYW1lfSwgJHtlbGVtZW50LnNlc3Npb25zLmxlbmd0aH1gO1xuXHRcdH1cblx0XHRpZiAoaXNTZXNzaW9uU2VjdGlvbihlbGVtZW50KSkge1xuXHRcdFx0aWYgKGVsZW1lbnQuaWQgPT09IEFVVE9NQVRJT05TX1NFQ1RJT05fSUQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuYXV0b21hdGlvblN0YXR1c1xuXHRcdFx0XHRcdD8gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0XHRcdFx0c3dpdGNoICh0aGlzLmF1dG9tYXRpb25TdGF0dXM/LnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdFx0XHRjYXNlIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzczpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2F1dG9tYXRpb25zQWN0aXZlQXJpYScsIFwiezB9LCBydW4gaW4gcHJvZ3Jlc3NcIiwgZWxlbWVudC5sYWJlbCk7XG5cdFx0XHRcdFx0XHRcdGNhc2UgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQ6XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhdXRvbWF0aW9uc1VucmVhZFJ1bkFyaWEnLCBcInswfSwgdW5yZWFkIHJ1blwiLCBlbGVtZW50LmxhYmVsKTtcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5sYWJlbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdDogZWxlbWVudC5sYWJlbDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBgJHtlbGVtZW50LmxhYmVsfSwgJHtlbGVtZW50LnNlc3Npb25zLmxlbmd0aH1gO1xuXHRcdH1cblx0XHRpZiAoaXNTZXNzaW9uU2hvd01vcmUoZWxlbWVudCkpIHtcblx0XHRcdGlmIChlbGVtZW50Lm1vZGUgPT09ICdsZXNzJykge1xuXHRcdFx0XHRyZXR1cm4gZWxlbWVudC5raW5kID09PSAnZm9sZGVycydcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdzaG93TGVzc1dvcmtzcGFjZXNBcmlhJywgXCJTaG93IGZld2VyIHdvcmtzcGFjZXNcIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdzaG93TGVzc0FyaWEnLCBcIlNob3cgZmV3ZXIgc2Vzc2lvbnNcIik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5raW5kID09PSAnZm9sZGVycydcblx0XHRcdFx0PyBlbGVtZW50LnJlbWFpbmluZ0NvdW50ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnc2hvd01vcmVXb3Jrc3BhY2VBcmlhJywgXCJTaG93IHswfSBtb3JlIHdvcmtzcGFjZVwiLCBlbGVtZW50LnJlbWFpbmluZ0NvdW50KVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ3Nob3dNb3JlV29ya3NwYWNlc0FyaWEnLCBcIlNob3cgezB9IG1vcmUgd29ya3NwYWNlc1wiLCBlbGVtZW50LnJlbWFpbmluZ0NvdW50KVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdzaG93TW9yZUFyaWEnLCBcIlNob3cgezB9IG1vcmUgc2Vzc2lvbnNcIiwgZWxlbWVudC5yZW1haW5pbmdDb3VudCk7XG5cdFx0fVxuXHRcdGlmIChpc1Nlc3Npb25QbGFjZWhvbGRlcihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuaG92ZXJcblx0XHRcdFx0PyBsb2NhbGl6ZSgnc2Vzc2lvblBsYWNlaG9sZGVyQXJpYScsIFwiezB9LiB7MX1cIiwgZWxlbWVudC5sYWJlbCwgZWxlbWVudC5ob3Zlcilcblx0XHRcdFx0OiBlbGVtZW50LmxhYmVsO1xuXHRcdH1cblx0XHRyZXR1cm4gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBlbGVtZW50LnRpdGxlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBmcm9tTm93KGVsZW1lbnQudXBkYXRlZEF0LnJlYWQocmVhZGVyKSwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC53b3JrdHJlZVBlbmRpbmc/LnJlYWQocmVhZGVyKVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdzZXNzaW9uSXRlbVdvcmt0cmVlUGVuZGluZ0FyaWEnLCBcInswfSwgY3JlYXRpbmcgd29ya3RyZWUsIHVwZGF0ZWQgezF9XCIsIHRpdGxlLCB1cGRhdGVkKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdzZXNzaW9uSXRlbUFyaWEnLCBcInswfSwgdXBkYXRlZCB7MX1cIiwgdGl0bGUsIHVwZGF0ZWQpO1xuXHRcdH0pO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gRHJhZyBhbmQgRHJvcFxuXG4vKipcbiAqIENhbGxiYWNrcyB0aGUgc2Vzc2lvbnMgbGlzdCBwcm92aWRlcyB0byBpdHMgZHJhZy1hbmQtZHJvcCBjb250cm9sbGVyIHNvIHRoZVxuICogY29udHJvbGxlciBjYW4gdmFsaWRhdGUgYW5kIGFwcGx5IG1hbnVhbCByZW9yZGVyaW5nIHdpdGhvdXQgb3duaW5nIHRoZSBsaXN0XG4gKiBtb2RlbCBpdHNlbGYuXG4gKi9cbmludGVyZmFjZSBJU2Vzc2lvbnNMaXN0RG5kRGVsZWdhdGUge1xuXHQvKiogV2hldGhlciBhIHNlc3Npb24gbWF5IHBhcnRpY2lwYXRlIGluIHJlb3JkZXJpbmcgd2l0aGluIGl0cyBjdXJyZW50IHNlY3Rpb24uICovXG5cdGlzUmVvcmRlcmFibGUoc2Vzc2lvbjogSVNlc3Npb24pOiBib29sZWFuO1xuXHQvKiogV2hldGhlciBhIHNlc3Npb24gY3VycmVudGx5IHJlbmRlcnMgaW4gdGhlIFBpbm5lZCBzZWN0aW9uLiAqL1xuXHRpc1Nlc3Npb25QaW5uZWQoc2Vzc2lvbjogSVNlc3Npb24pOiBib29sZWFuO1xuXHQvKiogV2hldGhlciB0aGUgZHJhZ2dlZCBzZXNzaW9ucyBtYXkgYmUgcmVvcmRlcmVkIHJlbGF0aXZlIHRvIHRoZSBnaXZlbiB0YXJnZXQuICovXG5cdGNhbkRyb3BPbihkcmFnZ2VkOiBJU2Vzc2lvbltdLCB0YXJnZXQ6IElTZXNzaW9uKTogYm9vbGVhbjtcblx0LyoqIEFwcGx5IHRoZSByZW9yZGVyLCBwbGFjaW5nIHRoZSBkcmFnZ2VkIHNlc3Npb25zIGJlZm9yZS9hZnRlciB0aGUgdGFyZ2V0LiAqL1xuXHRyZW9yZGVyKGRyYWdnZWQ6IElTZXNzaW9uW10sIHRhcmdldDogSVNlc3Npb24sIHBvc2l0aW9uOiAnYmVmb3JlJyB8ICdhZnRlcicpOiB2b2lkO1xuXHQvKiogVGhlIGlkIG9mIHRoZSBncm91cCB0aGUgc2Vzc2lvbiBiZWxvbmdzIHRvLCBvciBgdW5kZWZpbmVkYC4gKi9cblx0Z2V0R3JvdXBJZE9mU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbik6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIEFkZCB0aGUgZ2l2ZW4gc2Vzc2lvbnMgdG8gdGhlIGdyb3VwLiAqL1xuXHRhZGRTZXNzaW9uc1RvR3JvdXAoc2Vzc2lvbnM6IElTZXNzaW9uW10sIGdyb3VwSWQ6IHN0cmluZywgdGFyZ2V0OiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCwgcG9zaXRpb246ICdiZWZvcmUnIHwgJ2FmdGVyJyB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cdC8qKiBQaW4gdGhlIGdpdmVuIHNlc3Npb25zLCBvcHRpb25hbGx5IHBsYWNpbmcgdGhlbSBiZWZvcmUvYWZ0ZXIgYSBwaW5uZWQgdGFyZ2V0LiAqL1xuXHRwaW5TZXNzaW9ucyhzZXNzaW9uczogSVNlc3Npb25bXSwgdGFyZ2V0OiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCwgcG9zaXRpb246ICdiZWZvcmUnIHwgJ2FmdGVyJyB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cdC8qKiBIaWdobGlnaHQgb25seSB0aGUgaGVhZGVyIHRoYXQgd2lsbCByZWNlaXZlIHRoZSBkcmFnZ2VkIHNlc3Npb25zLiAqL1xuXHRzZXREcm9wVGFyZ2V0SGVhZGVyKGhlYWRlcjogSVNlc3Npb25Ecm9wVGFyZ2V0SGVhZGVyIHwgdW5kZWZpbmVkKTogdm9pZDtcblx0LyoqIFJlb3JkZXIgYSB0b3AtbGV2ZWwgaGVhZGVyIChncm91cCBvciB3b3Jrc3BhY2Ugc2VjdGlvbikgYmVmb3JlL2FmdGVyIGFub3RoZXIuICovXG5cdHJlb3JkZXJTZWN0aW9uKGRyYWdnZWRJZDogc3RyaW5nLCB0YXJnZXRJZDogc3RyaW5nLCBwb3NpdGlvbjogJ2JlZm9yZScgfCAnYWZ0ZXInLCBpc1dvcmtzcGFjZTogYm9vbGVhbik6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBJU2Vzc2lvbkRyb3BUYXJnZXRIZWFkZXIge1xuXHRyZWFkb25seSBraW5kOiAnZ3JvdXAnIHwgJ3NlY3Rpb24nO1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVNlc3Npb25NZW1iZXJzaGlwRHJvcFRhcmdldCB7XG5cdHJlYWRvbmx5IHNlc3Npb25zOiBJU2Vzc2lvbltdO1xuXHRyZWFkb25seSBoZWFkZXI6IElTZXNzaW9uRHJvcFRhcmdldEhlYWRlcjtcblx0cmVhZG9ubHkgdGFyZ2V0OiBJU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcG9zaXRpb246ICdiZWZvcmUnIHwgJ2FmdGVyJyB8IHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIElTZXNzaW9uQWRkVG9Hcm91cERyb3BUYXJnZXQgZXh0ZW5kcyBJU2Vzc2lvbk1lbWJlcnNoaXBEcm9wVGFyZ2V0IHtcblx0cmVhZG9ubHkgZ3JvdXBJZDogc3RyaW5nO1xufVxuXG4vKiogQSB0b3AtbGV2ZWwgaGVhZGVyIChncm91cCBvciB3b3Jrc3BhY2Ugc2VjdGlvbikgY3VycmVudGx5IGJlaW5nIGRyYWdnZWQgdG8gcmVvcmRlci4gKi9cbmludGVyZmFjZSBJRHJhZ2dlZEhlYWRlciB7XG5cdC8qKiBUaGUgcmVvcmRlciBpZGVudGl0eSAoYGdyb3VwOjxpZD5gIG9yIGB3b3Jrc3BhY2U6PGxhYmVsPmApLiAqL1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHQvKiogV2hldGhlciB0aGUgZHJhZ2dlZCBoZWFkZXIgaXMgYSB3b3Jrc3BhY2Ugc2VjdGlvbiAodnMuIGEgdXNlciBncm91cCkuICovXG5cdHJlYWRvbmx5IGlzV29ya3NwYWNlOiBib29sZWFuO1xufVxuXG5jbGFzcyBTZXNzaW9uc0xpc3REcmFnQW5kRHJvcCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVHJlZURyYWdBbmREcm9wPFNlc3Npb25MaXN0SXRlbT4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyYW5zZmVyID0gTG9jYWxTZWxlY3Rpb25UcmFuc2Zlci5nZXRJbnN0YW5jZTxEcmFnZ2VkU2Vzc2lvbklkZW50aWZpZXI+KCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBkZWxlZ2F0ZTogSVNlc3Npb25zTGlzdERuZERlbGVnYXRlKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGdldERyYWdVUkkoZWxlbWVudDogU2Vzc2lvbkxpc3RJdGVtKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKGlzU2Vzc2lvbkdyb3VwSXRlbShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGBzZXNzaW9uR3JvdXA6JHtlbGVtZW50Lmdyb3VwLmlkfWA7XG5cdFx0fVxuXHRcdGlmIChpc1Nlc3Npb25TZWN0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHQvLyBPbmx5IHdvcmtzcGFjZSBzZWN0aW9ucyBhcmUgcmVvcmRlcmFibGU7IFBpbm5lZCwgRG9uZSBhbmQgdGhlIGRhdGVcblx0XHRcdC8vIHNlY3Rpb25zIHN0YXkgZml4ZWQgYW5kIGFyZSB0aGVyZWZvcmUgbm90IGRyYWdnYWJsZS5cblx0XHRcdHJldHVybiBlbGVtZW50LmlkLnN0YXJ0c1dpdGgoJ3dvcmtzcGFjZTonKSA/IGBzZXNzaW9uV29ya3NwYWNlOiR7ZWxlbWVudC5pZH1gIDogbnVsbDtcblx0XHR9XG5cdFx0aWYgKGlzU2Vzc2lvblNob3dNb3JlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKGlzU2Vzc2lvblBsYWNlaG9sZGVyKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIGVsZW1lbnQucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0fVxuXG5cdGdldERyYWdMYWJlbChlbGVtZW50czogU2Vzc2lvbkxpc3RJdGVtW10pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGdyb3VwSXRlbSA9IGVsZW1lbnRzLmZpbmQoaXNTZXNzaW9uR3JvdXBJdGVtKTtcblx0XHRpZiAoZ3JvdXBJdGVtKSB7XG5cdFx0XHRyZXR1cm4gZ3JvdXBJdGVtLmdyb3VwLm5hbWU7XG5cdFx0fVxuXHRcdGNvbnN0IHdvcmtzcGFjZVNlY3Rpb24gPSBlbGVtZW50cy5maW5kKChlKTogZSBpcyBJU2Vzc2lvblNlY3Rpb24gPT4gaXNTZXNzaW9uU2VjdGlvbihlKSAmJiBlLmlkLnN0YXJ0c1dpdGgoJ3dvcmtzcGFjZTonKSk7XG5cdFx0aWYgKHdvcmtzcGFjZVNlY3Rpb24pIHtcblx0XHRcdHJldHVybiB3b3Jrc3BhY2VTZWN0aW9uLmxhYmVsO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMudG9TZXNzaW9ucyhlbGVtZW50cyk7XG5cdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIHNlc3Npb25zWzBdLnRpdGxlLmdldCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gbG9jYWxpemUoJ3Nlc3Npb25zLmRyYWdMYWJlbCcsIFwiezB9IHNlc3Npb25zXCIsIHNlc3Npb25zLmxlbmd0aCk7XG5cdH1cblxuXHRvbkRyYWdTdGFydChkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMudG9TZXNzaW9ucyhkYXRhIGluc3RhbmNlb2YgRWxlbWVudHNEcmFnQW5kRHJvcERhdGEgPyBkYXRhLmVsZW1lbnRzIGFzIFNlc3Npb25MaXN0SXRlbVtdIDogW10pO1xuXHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpZGVudGlmaWVycyA9IHNlc3Npb25zLm1hcChzID0+IG5ldyBEcmFnZ2VkU2Vzc2lvbklkZW50aWZpZXIocy5zZXNzaW9uSWQsIHMucmVzb3VyY2UpKTtcblx0XHR0aGlzLl90cmFuc2Zlci5zZXREYXRhKGlkZW50aWZpZXJzLCBEcmFnZ2VkU2Vzc2lvbklkZW50aWZpZXIucHJvdG90eXBlKTtcblxuXHRcdGlmIChvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0Ly8gRXhwb3NlIHRoZSBmaXJzdCBkcmFnZ2VkIHNlc3Npb24gYXMgYSB0eXBlZCBwYXlsb2FkIGFzIHdlbGwgc28gZXh0ZXJuYWxcblx0XHRcdC8vIGRyb3AgaGFuZGxlcnMgY2FuIHJlYWQgaXQgd2l0aG91dCB1c2luZyB0aGUgbG9jYWwgdHJhbnNmZXIuXG5cdFx0XHRjb25zdCBwYXlsb2FkID0gSlNPTi5zdHJpbmdpZnkoeyBzZXNzaW9uSWQ6IHNlc3Npb25zWzBdLnNlc3Npb25JZCwgcmVzb3VyY2U6IHNlc3Npb25zWzBdLnJlc291cmNlLnRvU3RyaW5nKCkgfSk7XG5cdFx0XHRvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2Zlci5zZXREYXRhKFNlc3Npb25zRGF0YVRyYW5zZmVycy5TRVNTSU9OLCBwYXlsb2FkKTtcblx0XHR9XG5cdH1cblxuXHRvbkRyYWdFbmQoKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJhbnNmZXIuY2xlYXJEYXRhKERyYWdnZWRTZXNzaW9uSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdHRoaXMuZGVsZWdhdGUuc2V0RHJvcFRhcmdldEhlYWRlcih1bmRlZmluZWQpO1xuXHR9XG5cblx0b25EcmFnT3ZlcihkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRFbGVtZW50OiBTZXNzaW9uTGlzdEl0ZW0gfCB1bmRlZmluZWQsIF90YXJnZXRJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB8IElUcmVlRHJhZ092ZXJSZWFjdGlvbiB7XG5cdFx0Y29uc3QgZHJhZ2dlZEhlYWRlciA9IHRoaXMuZHJhZ2dlZEhlYWRlcihkYXRhKTtcblx0XHRpZiAoZHJhZ2dlZEhlYWRlcikge1xuXHRcdFx0dGhpcy5kZWxlZ2F0ZS5zZXREcm9wVGFyZ2V0SGVhZGVyKHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5vbkhlYWRlckRyYWdPdmVyKGRyYWdnZWRIZWFkZXIsIHRhcmdldEVsZW1lbnQsIHRhcmdldFNlY3Rvcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGluVGFyZ2V0ID0gdGhpcy5yZXNvbHZlUGluVGFyZ2V0KGRhdGEsIHRhcmdldEVsZW1lbnQsIHRhcmdldFNlY3Rvcik7XG5cdFx0aWYgKHBpblRhcmdldCkge1xuXHRcdFx0dGhpcy5kZWxlZ2F0ZS5zZXREcm9wVGFyZ2V0SGVhZGVyKHBpblRhcmdldC5oZWFkZXIpO1xuXHRcdFx0cmV0dXJuIHRoaXMudG9NZW1iZXJzaGlwRHJvcFJlYWN0aW9uKHBpblRhcmdldCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWRkVG9Hcm91cFRhcmdldCA9IHRoaXMucmVzb2x2ZUFkZFRvR3JvdXBUYXJnZXQoZGF0YSwgdGFyZ2V0RWxlbWVudCwgdGFyZ2V0U2VjdG9yKTtcblx0XHRpZiAoYWRkVG9Hcm91cFRhcmdldCkge1xuXHRcdFx0dGhpcy5kZWxlZ2F0ZS5zZXREcm9wVGFyZ2V0SGVhZGVyKGFkZFRvR3JvdXBUYXJnZXQuaGVhZGVyKTtcblx0XHRcdHJldHVybiB0aGlzLnRvTWVtYmVyc2hpcERyb3BSZWFjdGlvbihhZGRUb0dyb3VwVGFyZ2V0KTtcblx0XHR9XG5cblx0XHR0aGlzLmRlbGVnYXRlLnNldERyb3BUYXJnZXRIZWFkZXIodW5kZWZpbmVkKTtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLnJlc29sdmVSZW9yZGVyVGFyZ2V0KGRhdGEsIHRhcmdldEVsZW1lbnQpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHBvc2l0aW9uID0gc2VjdG9yVG9Qb3NpdGlvbih0YXJnZXRTZWN0b3IpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRhY2NlcHQ6IHRydWUsXG5cdFx0XHRlZmZlY3Q6IHtcblx0XHRcdFx0dHlwZTogTGlzdERyYWdPdmVyRWZmZWN0VHlwZS5Nb3ZlLFxuXHRcdFx0XHRwb3NpdGlvbjogcG9zaXRpb24gPT09ICdhZnRlcicgPyBMaXN0RHJhZ092ZXJFZmZlY3RQb3NpdGlvbi5BZnRlciA6IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLkJlZm9yZSxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdGRyb3AoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0RWxlbWVudDogU2Vzc2lvbkxpc3RJdGVtIHwgdW5kZWZpbmVkLCBfdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuZGVsZWdhdGUuc2V0RHJvcFRhcmdldEhlYWRlcih1bmRlZmluZWQpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBkcmFnZ2VkSGVhZGVyID0gdGhpcy5kcmFnZ2VkSGVhZGVyKGRhdGEpO1xuXHRcdFx0aWYgKGRyYWdnZWRIZWFkZXIpIHtcblx0XHRcdFx0aWYgKHRhcmdldEVsZW1lbnQpIHtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXRSZWYgPSB0aGlzLmhlYWRlclJlZk9mKHRhcmdldEVsZW1lbnQpO1xuXHRcdFx0XHRcdGlmICh0YXJnZXRSZWYgJiYgdGFyZ2V0UmVmICE9PSBkcmFnZ2VkSGVhZGVyLmlkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmRlbGVnYXRlLnJlb3JkZXJTZWN0aW9uKGRyYWdnZWRIZWFkZXIuaWQsIHRhcmdldFJlZiwgc2VjdG9yVG9Qb3NpdGlvbih0YXJnZXRTZWN0b3IpLCBkcmFnZ2VkSGVhZGVyLmlzV29ya3NwYWNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwaW5UYXJnZXQgPSB0aGlzLnJlc29sdmVQaW5UYXJnZXQoZGF0YSwgdGFyZ2V0RWxlbWVudCwgdGFyZ2V0U2VjdG9yKTtcblx0XHRcdGlmIChwaW5UYXJnZXQpIHtcblx0XHRcdFx0dGhpcy5kZWxlZ2F0ZS5waW5TZXNzaW9ucyhwaW5UYXJnZXQuc2Vzc2lvbnMsIHBpblRhcmdldC50YXJnZXQsIHBpblRhcmdldC5wb3NpdGlvbik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWRkVG9Hcm91cFRhcmdldCA9IHRoaXMucmVzb2x2ZUFkZFRvR3JvdXBUYXJnZXQoZGF0YSwgdGFyZ2V0RWxlbWVudCwgdGFyZ2V0U2VjdG9yKTtcblx0XHRcdGlmIChhZGRUb0dyb3VwVGFyZ2V0KSB7XG5cdFx0XHRcdHRoaXMuZGVsZWdhdGUuYWRkU2Vzc2lvbnNUb0dyb3VwKGFkZFRvR3JvdXBUYXJnZXQuc2Vzc2lvbnMsIGFkZFRvR3JvdXBUYXJnZXQuZ3JvdXBJZCwgYWRkVG9Hcm91cFRhcmdldC50YXJnZXQsIGFkZFRvR3JvdXBUYXJnZXQucG9zaXRpb24pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMucmVzb2x2ZVJlb3JkZXJUYXJnZXQoZGF0YSwgdGFyZ2V0RWxlbWVudCk7XG5cdFx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRlbGVnYXRlLnJlb3JkZXIodGhpcy5kcmFnZ2VkU2Vzc2lvbnMoZGF0YSksIHRhcmdldCwgc2VjdG9yVG9Qb3NpdGlvbih0YXJnZXRTZWN0b3IpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5kZWxlZ2F0ZS5zZXREcm9wVGFyZ2V0SGVhZGVyKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkhlYWRlckRyYWdPdmVyKGRyYWdnZWRIZWFkZXI6IElEcmFnZ2VkSGVhZGVyLCB0YXJnZXRFbGVtZW50OiBTZXNzaW9uTGlzdEl0ZW0gfCB1bmRlZmluZWQsIHRhcmdldFNlY3RvcjogTGlzdFZpZXdUYXJnZXRTZWN0b3IgfCB1bmRlZmluZWQpOiBib29sZWFuIHwgSVRyZWVEcmFnT3ZlclJlYWN0aW9uIHtcblx0XHRpZiAoIXRhcmdldEVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0UmVmID0gdGhpcy5oZWFkZXJSZWZPZih0YXJnZXRFbGVtZW50KTtcblx0XHRpZiAoIXRhcmdldFJlZiB8fCB0YXJnZXRSZWYgPT09IGRyYWdnZWRIZWFkZXIuaWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBzZWN0b3JUb1Bvc2l0aW9uKHRhcmdldFNlY3Rvcik7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFjY2VwdDogdHJ1ZSxcblx0XHRcdGVmZmVjdDoge1xuXHRcdFx0XHR0eXBlOiBMaXN0RHJhZ092ZXJFZmZlY3RUeXBlLk1vdmUsXG5cdFx0XHRcdHBvc2l0aW9uOiBwb3NpdGlvbiA9PT0gJ2FmdGVyJyA/IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLkFmdGVyIDogTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24uQmVmb3JlLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlUGluVGFyZ2V0KGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldEVsZW1lbnQ6IFNlc3Npb25MaXN0SXRlbSB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCk6IElTZXNzaW9uTWVtYmVyc2hpcERyb3BUYXJnZXQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGFyZ2V0RWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgdGFyZ2V0OiBJU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAoaXNTZXNzaW9uU2VjdGlvbih0YXJnZXRFbGVtZW50KSkge1xuXHRcdFx0aWYgKHRhcmdldEVsZW1lbnQuaWQgIT09ICdwaW5uZWQnKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpc1Nlc3Npb25JdGVtKHRhcmdldEVsZW1lbnQpICYmIHRoaXMuZGVsZWdhdGUuaXNTZXNzaW9uUGlubmVkKHRhcmdldEVsZW1lbnQpKSB7XG5cdFx0XHR0YXJnZXQgPSB0YXJnZXRFbGVtZW50O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRyYWdnZWQgPSB0aGlzLmRyYWdnZWRTZXNzaW9ucyhkYXRhKTtcblx0XHRjb25zdCBoYXNBcmNoaXZlZCA9IGRyYWdnZWQuc29tZShzZXNzaW9uID0+IHNlc3Npb24uaXNBcmNoaXZlZC5nZXQoKSk7XG5cdFx0Y29uc3QgYWxsUGlubmVkID0gZHJhZ2dlZC5ldmVyeShzZXNzaW9uID0+IHRoaXMuZGVsZWdhdGUuaXNTZXNzaW9uUGlubmVkKHNlc3Npb24pKTtcblx0XHRpZiAoZHJhZ2dlZC5sZW5ndGggPT09IDAgfHwgaGFzQXJjaGl2ZWQgfHwgYWxsUGlubmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGFyZ2V0ICYmIGRyYWdnZWQuc29tZShzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkID09PSB0YXJnZXQuc2Vzc2lvbklkKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlc3Npb25zOiBkcmFnZ2VkLFxuXHRcdFx0aGVhZGVyOiB7IGtpbmQ6ICdzZWN0aW9uJywgaWQ6ICdwaW5uZWQnIH0sXG5cdFx0XHR0YXJnZXQsXG5cdFx0XHRwb3NpdGlvbjogdGFyZ2V0ID8gc2VjdG9yVG9Qb3NpdGlvbih0YXJnZXRTZWN0b3IpIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVBZGRUb0dyb3VwVGFyZ2V0KGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldEVsZW1lbnQ6IFNlc3Npb25MaXN0SXRlbSB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCk6IElTZXNzaW9uQWRkVG9Hcm91cERyb3BUYXJnZXQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGFyZ2V0RWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IGdyb3VwSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgdGFyZ2V0OiBJU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAoaXNTZXNzaW9uR3JvdXBJdGVtKHRhcmdldEVsZW1lbnQpKSB7XG5cdFx0XHRncm91cElkID0gdGFyZ2V0RWxlbWVudC5ncm91cC5pZDtcblx0XHR9IGVsc2UgaWYgKGlzU2Vzc2lvblBsYWNlaG9sZGVyKHRhcmdldEVsZW1lbnQpICYmIHRhcmdldEVsZW1lbnQuc2VjdGlvbklkLnN0YXJ0c1dpdGgoJ2dyb3VwOicpKSB7XG5cdFx0XHRncm91cElkID0gdGFyZ2V0RWxlbWVudC5zZWN0aW9uSWQuc2xpY2UoJ2dyb3VwOicubGVuZ3RoKTtcblx0XHR9IGVsc2UgaWYgKGlzU2Vzc2lvbkl0ZW0odGFyZ2V0RWxlbWVudCkpIHtcblx0XHRcdGdyb3VwSWQgPSB0aGlzLmRlbGVnYXRlLmdldEdyb3VwSWRPZlNlc3Npb24odGFyZ2V0RWxlbWVudCk7XG5cdFx0XHR0YXJnZXQgPSBncm91cElkID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiB0YXJnZXRFbGVtZW50O1xuXHRcdH1cblx0XHRpZiAoZ3JvdXBJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRyYWdnZWQgPSB0aGlzLmRyYWdnZWRTZXNzaW9ucyhkYXRhKTtcblx0XHRjb25zdCBoYXNBcmNoaXZlZCA9IGRyYWdnZWQuc29tZShzZXNzaW9uID0+IHNlc3Npb24uaXNBcmNoaXZlZC5nZXQoKSk7XG5cdFx0Y29uc3QgYWxsSW5Hcm91cCA9IGRyYWdnZWQuZXZlcnkoc2Vzc2lvbiA9PiB0aGlzLmRlbGVnYXRlLmdldEdyb3VwSWRPZlNlc3Npb24oc2Vzc2lvbikgPT09IGdyb3VwSWQpO1xuXHRcdGlmIChkcmFnZ2VkLmxlbmd0aCA9PT0gMCB8fCBoYXNBcmNoaXZlZCB8fCBhbGxJbkdyb3VwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGFyZ2V0ICYmIGRyYWdnZWQuc29tZShzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkID09PSB0YXJnZXQuc2Vzc2lvbklkKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlc3Npb25zOiBkcmFnZ2VkLFxuXHRcdFx0Z3JvdXBJZCxcblx0XHRcdGhlYWRlcjogeyBraW5kOiAnZ3JvdXAnLCBpZDogZ3JvdXBJZCB9LFxuXHRcdFx0dGFyZ2V0LFxuXHRcdFx0cG9zaXRpb246IHRhcmdldCA/IHNlY3RvclRvUG9zaXRpb24odGFyZ2V0U2VjdG9yKSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgdGhlIHNlc3Npb24gdGhlIGRyb3Agc2hvdWxkIGJlIHBvc2l0aW9uZWQgYWdhaW5zdCwgb3IgYHVuZGVmaW5lZGBcblx0ICogaWYgdGhlIGN1cnJlbnQgZHJhZyBpcyBub3QgYSB2YWxpZCBpbi1saXN0IHJlb3JkZXIuXG5cdCAqL1xuXHRwcml2YXRlIHJlc29sdmVSZW9yZGVyVGFyZ2V0KGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldEVsZW1lbnQ6IFNlc3Npb25MaXN0SXRlbSB8IHVuZGVmaW5lZCk6IElTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRhcmdldEVsZW1lbnQgfHwgIWlzU2Vzc2lvbkl0ZW0odGFyZ2V0RWxlbWVudCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHRhcmdldCA9IHRhcmdldEVsZW1lbnQ7XG5cdFx0aWYgKCF0aGlzLmRlbGVnYXRlLmlzUmVvcmRlcmFibGUodGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZHJhZ2dlZCA9IHRoaXMuZHJhZ2dlZFNlc3Npb25zKGRhdGEpO1xuXHRcdGlmIChkcmFnZ2VkLmxlbmd0aCA9PT0gMCB8fCBkcmFnZ2VkLnNvbWUocyA9PiBzLnNlc3Npb25JZCA9PT0gdGFyZ2V0LnNlc3Npb25JZCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChkcmFnZ2VkLnNvbWUocyA9PiAhdGhpcy5kZWxlZ2F0ZS5pc1Jlb3JkZXJhYmxlKHMpKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmRlbGVnYXRlLmNhbkRyb3BPbihkcmFnZ2VkLCB0YXJnZXQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGFyZ2V0O1xuXHR9XG5cblx0cHJpdmF0ZSB0b01lbWJlcnNoaXBEcm9wUmVhY3Rpb24odGFyZ2V0OiBJU2Vzc2lvbk1lbWJlcnNoaXBEcm9wVGFyZ2V0KTogSVRyZWVEcmFnT3ZlclJlYWN0aW9uIHtcblx0XHRsZXQgcG9zaXRpb24gPSBMaXN0RHJhZ092ZXJFZmZlY3RQb3NpdGlvbi5PdmVyO1xuXHRcdGlmICh0YXJnZXQucG9zaXRpb24gPT09ICdhZnRlcicpIHtcblx0XHRcdHBvc2l0aW9uID0gTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24uQWZ0ZXI7XG5cdFx0fSBlbHNlIGlmICh0YXJnZXQucG9zaXRpb24gPT09ICdiZWZvcmUnKSB7XG5cdFx0XHRwb3NpdGlvbiA9IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLkJlZm9yZTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFjY2VwdDogdHJ1ZSxcblx0XHRcdGVmZmVjdDoge1xuXHRcdFx0XHR0eXBlOiBMaXN0RHJhZ092ZXJFZmZlY3RUeXBlLk1vdmUsXG5cdFx0XHRcdHBvc2l0aW9uLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBkcmFnZ2VkSGVhZGVyKGRhdGE6IElEcmFnQW5kRHJvcERhdGEpOiBJRHJhZ2dlZEhlYWRlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCEoZGF0YSBpbnN0YW5jZW9mIEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZWxlbWVudHMgPSBkYXRhLmVsZW1lbnRzIGFzIFNlc3Npb25MaXN0SXRlbVtdO1xuXHRcdGNvbnN0IGdyb3VwSXRlbSA9IGVsZW1lbnRzLmZpbmQoaXNTZXNzaW9uR3JvdXBJdGVtKTtcblx0XHRpZiAoZ3JvdXBJdGVtKSB7XG5cdFx0XHRyZXR1cm4geyBpZDogYGdyb3VwOiR7Z3JvdXBJdGVtLmdyb3VwLmlkfWAsIGlzV29ya3NwYWNlOiBmYWxzZSB9O1xuXHRcdH1cblx0XHRjb25zdCB3b3Jrc3BhY2VTZWN0aW9uID0gZWxlbWVudHMuZmluZCgoZSk6IGUgaXMgSVNlc3Npb25TZWN0aW9uID0+IGlzU2Vzc2lvblNlY3Rpb24oZSkgJiYgZS5pZC5zdGFydHNXaXRoKCd3b3Jrc3BhY2U6JykpO1xuXHRcdGlmICh3b3Jrc3BhY2VTZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4geyBpZDogd29ya3NwYWNlU2VjdGlvbi5pZCwgaXNXb3Jrc3BhY2U6IHRydWUgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKiBUaGUgcmVvcmRlciBpZGVudGl0eSBvZiBhIHRvcC1sZXZlbCBoZWFkZXIgZWxlbWVudCwgb3IgYHVuZGVmaW5lZGAgd2hlbiBpdCBpcyBub3QgcmVvcmRlcmFibGUuICovXG5cdHByaXZhdGUgaGVhZGVyUmVmT2YoZWxlbWVudDogU2Vzc2lvbkxpc3RJdGVtKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaXNTZXNzaW9uR3JvdXBJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gYGdyb3VwOiR7ZWxlbWVudC5ncm91cC5pZH1gO1xuXHRcdH1cblx0XHRpZiAoaXNTZXNzaW9uU2VjdGlvbihlbGVtZW50KSAmJiBlbGVtZW50LmlkLnN0YXJ0c1dpdGgoJ3dvcmtzcGFjZTonKSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuaWQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGRyYWdnZWRTZXNzaW9ucyhkYXRhOiBJRHJhZ0FuZERyb3BEYXRhKTogSVNlc3Npb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMudG9TZXNzaW9ucyhkYXRhIGluc3RhbmNlb2YgRWxlbWVudHNEcmFnQW5kRHJvcERhdGEgPyBkYXRhLmVsZW1lbnRzIGFzIFNlc3Npb25MaXN0SXRlbVtdIDogW10pO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1Nlc3Npb25zKGVsZW1lbnRzOiBTZXNzaW9uTGlzdEl0ZW1bXSk6IElTZXNzaW9uW10ge1xuXHRcdHJldHVybiBlbGVtZW50cy5maWx0ZXIoaXNTZXNzaW9uSXRlbSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gc2VjdG9yVG9Qb3NpdGlvbihzZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkKTogJ2JlZm9yZScgfCAnYWZ0ZXInIHtcblx0cmV0dXJuIHNlY3RvciAhPT0gdW5kZWZpbmVkICYmIHNlY3RvciA+PSBMaXN0Vmlld1RhcmdldFNlY3Rvci5DRU5URVJfQk9UVE9NID8gJ2FmdGVyJyA6ICdiZWZvcmUnO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFNlc3Npb25zIExpc3QgQ29udHJvbFxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uc0xpc3RDb250cm9sT3B0aW9ucyB7XG5cdHJlYWRvbmx5IG92ZXJyaWRlU3R5bGVzPzogSVN0eWxlT3ZlcnJpZGU8SUxpc3RTdHlsZXM+O1xuXHRyZWFkb25seSBncm91cGluZzogKCkgPT4gU2Vzc2lvbnNHcm91cGluZztcblx0cmVhZG9ubHkgc29ydGluZzogKCkgPT4gU2Vzc2lvbnNTb3J0aW5nO1xuXHRyZWFkb25seSBmaW5kV2lkZ2V0Q29udGFpbmVyPzogSFRNTEVsZW1lbnQ7XG5cdG9uU2Vzc2lvbk9wZW4ocmVzb3VyY2U6IFVSSSwgcHJlc2VydmVGb2N1czogYm9vbGVhbiwgc2lkZUJ5U2lkZTogYm9vbGVhbik6IHZvaWQ7XG59XG5cbi8qKlxuICogQGRlcHJlY2F0ZWQgVXNlIHtAbGluayBJU2Vzc2lvbnNMaXN0Q29udHJvbE9wdGlvbnN9IGluc3RlYWQuXG4gKi9cbmV4cG9ydCB0eXBlIElTZXNzaW9uc0xpc3RPcHRpb25zID0gSVNlc3Npb25zTGlzdENvbnRyb2xPcHRpb25zO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uc0xpc3Qge1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgb25EaWRVcGRhdGU6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbmRPcGVuU3RhdGU6IEV2ZW50PGJvb2xlYW4+O1xuXHRyZWZyZXNoKCk6IHZvaWQ7XG5cdHJldmVhbChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBzZXNzaW9ucyBjdXJyZW50bHkgdmlzaWJsZSBpbiB0aGUgbGlzdCwgaW4gZGlzcGxheSBvcmRlci5cblx0ICogU2Vzc2lvbnMgaGlkZGVuIGJ5IHNlY3Rpb24gY2FwcGluZyAoXCJzaG93IG1vcmVcIikgYXJlIGV4Y2x1ZGVkLlxuXHQgKi9cblx0Z2V0VmlzaWJsZVNlc3Npb25zKCk6IHJlYWRvbmx5IElTZXNzaW9uW107XG5cdGNsZWFyRm9jdXMoKTogdm9pZDtcblx0aGFzRm9jdXNPclNlbGVjdGlvbigpOiBib29sZWFuO1xuXHRzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkO1xuXHRsYXlvdXQoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkO1xuXHRmb2N1cygpOiB2b2lkO1xuXHR1cGRhdGUoZXhwYW5kQWxsPzogYm9vbGVhbik6IHZvaWQ7XG5cdG9wZW5GaW5kKCk6IHZvaWQ7XG5cdGNsb3NlRmluZCgpOiB2b2lkO1xuXHRyZXNldFNlY3Rpb25Db2xsYXBzZVN0YXRlKCk6IHZvaWQ7XG5cdHBpblNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkO1xuXHR1bnBpblNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkO1xuXHRpc1Nlc3Npb25QaW5uZWQoc2Vzc2lvbjogSVNlc3Npb24pOiBib29sZWFuO1xuXHRzZXRTZXNzaW9uVHlwZUV4Y2x1ZGVkKHNlc3Npb25UeXBlSWQ6IHN0cmluZywgZXhjbHVkZWQ6IGJvb2xlYW4pOiB2b2lkO1xuXHRpc1Nlc3Npb25UeXBlRXhjbHVkZWQoc2Vzc2lvblR5cGVJZDogc3RyaW5nKTogYm9vbGVhbjtcblx0c2V0U3RhdHVzRXhjbHVkZWQoc3RhdHVzOiBTZXNzaW9uU3RhdHVzLCBleGNsdWRlZDogYm9vbGVhbik6IHZvaWQ7XG5cdGlzU3RhdHVzRXhjbHVkZWQoc3RhdHVzOiBTZXNzaW9uU3RhdHVzKTogYm9vbGVhbjtcblx0c2V0RXhjbHVkZUFyY2hpdmVkKGV4Y2x1ZGU6IGJvb2xlYW4pOiB2b2lkO1xuXHRpc0V4Y2x1ZGVBcmNoaXZlZCgpOiBib29sZWFuO1xuXHRzZXRFeGNsdWRlUmVhZChleGNsdWRlOiBib29sZWFuKTogdm9pZDtcblx0aXNFeGNsdWRlUmVhZCgpOiBib29sZWFuO1xuXHRyZXNldEZpbHRlcnMoKTogdm9pZDtcblx0c2V0V29ya3NwYWNlR3JvdXBDYXBwZWQoY2FwcGVkOiBib29sZWFuKTogdm9pZDtcblx0aXNXb3Jrc3BhY2VHcm91cENhcHBlZCgpOiBib29sZWFuO1xuXHRzZXRPcGVuV2luZG93U291cmNlRm9sZGVyKGZvbGRlcjogVVJJIHwgdW5kZWZpbmVkKTogdm9pZDtcblx0Y29sbGFwc2VBbGxTZWN0aW9ucygpOiB2b2lkO1xuXHRjcmVhdGVHcm91cEZyb21TZXNzaW9ucyhzZXNzaW9uczogSVNlc3Npb25bXSk6IHZvaWQ7XG5cdGJlZ2luUmVuYW1lR3JvdXAoZ3JvdXBJZDogc3RyaW5nKTogdm9pZDtcblx0YWRkU2Vzc2lvbnNUb0dyb3VwKHNlc3Npb25zOiBJU2Vzc2lvbltdLCBncm91cElkOiBzdHJpbmcsIHRhcmdldD86IElTZXNzaW9uLCBwb3NpdGlvbj86ICdiZWZvcmUnIHwgJ2FmdGVyJyk6IHZvaWQ7XG5cdGdldEdyb3Vwc0luRGlzcGxheU9yZGVyKCk6IElTZXNzaW9uR3JvdXBbXTtcbn1cblxuZXhwb3J0IGNsYXNzIFNlc3Npb25zTGlzdCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2Vzc2lvbnNMaXN0IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRUNUSU9OX0NPTExBUFNFX1NUQVRFX0tFWSA9ICdzZXNzaW9uc0xpc3RDb250cm9sLnNlY3Rpb25Db2xsYXBzZVN0YXRlJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRVhDTFVERURfVFlQRVNfS0VZID0gJ3Nlc3Npb25zTGlzdENvbnRyb2wuZXhjbHVkZWRTZXNzaW9uVHlwZXMnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFWENMVURFRF9TVEFUVVNFU19LRVkgPSAnc2Vzc2lvbnNMaXN0Q29udHJvbC5leGNsdWRlZFN0YXR1c2VzJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRVhDTFVERV9BUkNISVZFRF9LRVkgPSAnc2Vzc2lvbnNMaXN0Q29udHJvbC5leGNsdWRlQXJjaGl2ZWQnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFWENMVURFX1JFQURfS0VZID0gJ3Nlc3Npb25zTGlzdENvbnRyb2wuZXhjbHVkZVJlYWQnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBXT1JLU1BBQ0VfR1JPVVBfQ0FQUEVEX0tFWSA9ICdzZXNzaW9uc0xpc3RDb250cm9sLndvcmtzcGFjZUdyb3VwQ2FwcGVkJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgREVGQVVMVF9TRVNTSU9OX0dST1VQX0xJTUlUID0gNTtcblxuXHQvKipcblx0ICogRXhwZXJpbWVudCB0cmVhdG1lbnQgdGhhdCBvdmVycmlkZXMgaG93IG1hbnkgc2Vzc2lvbnMgYXJlIHNob3duIHBlciBncm91cFxuXHQgKiBiZWZvcmUgdGhlIFwic2hvdyBtb3JlXCIgYWZmb3JkYW5jZSBhcHBlYXJzLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VTU0lPTl9HUk9VUF9MSU1JVF9UUkVBVE1FTlQgPSAnc2Vzc2lvbnMud29ya3NwYWNlR3JvdXBMaW1pdCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsaXN0Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSB0cmVlOiBXb3JrYmVuY2hPYmplY3RUcmVlPFNlc3Npb25MaXN0SXRlbSwgRnV6enlTY29yZT47XG5cdHByaXZhdGUgc2Vzc2lvbnM6IElTZXNzaW9uW10gPSBbXTtcblx0cHJpdmF0ZSB2aXNpYmxlID0gdHJ1ZTtcblx0cHJpdmF0ZSByZWFkb25seSBleGNsdWRlZFNlc3Npb25UeXBlczogU2V0PHN0cmluZz47XG5cdHByaXZhdGUgcmVhZG9ubHkgZXhjbHVkZWRTdGF0dXNlczogU2V0PFNlc3Npb25TdGF0dXM+O1xuXHRwcml2YXRlIF9leGNsdWRlQXJjaGl2ZWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX2V4Y2x1ZGVSZWFkOiBib29sZWFuO1xuXHRwcml2YXRlIHdvcmtzcGFjZUdyb3VwQ2FwcGVkOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBNYXhpbXVtIG51bWJlciBvZiBzZXNzaW9ucyBzaG93biBwZXIgd29ya3NwYWNlIHNlY3Rpb24gb3IgdXNlciBncm91cC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbkdyb3VwTGltaXQgPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyPih0aGlzLCBTZXNzaW9uc0xpc3QuREVGQVVMVF9TRVNTSU9OX0dST1VQX0xJTUlUKTtcblx0cHJpdmF0ZSByZWFkb25seSBleHBhbmRlZFNlc3Npb25Hcm91cHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSBleHBhbmRlZE1vcmVGb2xkZXJzID0gZmFsc2U7XG5cdHByaXZhdGUgb3BlbldpbmRvd1NvdXJjZUZvbGRlcjogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGhhc0ZpbmRQYXR0ZXJuID0gZmFsc2U7XG5cdHByaXZhdGUgc3VzcGVuZENvbGxhcHNlU3RhdGVQZXJzaXN0ZW5jZSA9IGZhbHNlO1xuXG5cdC8qKiBUaGUgZ3JvdXAgd2hvc2UgaGVhZGVyIGlzIGN1cnJlbnRseSBzaG93aW5nIGl0cyBpbmxpbmUgbmFtZSBlZGl0b3IuICovXG5cdHByaXZhdGUgX2VkaXRpbmdHcm91cElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2dyb3VwUmVuZGVyZXIhOiBTZXNzaW9uR3JvdXBSZW5kZXJlcjtcblx0cHJpdmF0ZSBfc2VjdGlvblJlbmRlcmVyITogU2Vzc2lvblNlY3Rpb25SZW5kZXJlcjtcblx0cHJpdmF0ZSBfc2Vzc2lvblJlbmRlcmVyITogU2Vzc2lvbkl0ZW1SZW5kZXJlcjtcblx0cHJpdmF0ZSBfc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlITogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZTtcblx0cHJpdmF0ZSBfZHJvcFRhcmdldEhlYWRlcjogSVNlc3Npb25Ecm9wVGFyZ2V0SGVhZGVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hcmNoaXZlQWN0aW9uc0luUHJvZ3Jlc3MgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHQvKipcblx0ICogU25hcHNob3Qgb2YgdGhlIGN1cnJlbnRseS1yZW5kZXJlZCByZW9yZGVyYWJsZSB0b3AtbGV2ZWwgaGVhZGVycyAoZ3JvdXBzXG5cdCAqIGFuZCwgaW4gd29ya3NwYWNlIG1vZGUsIHdvcmtzcGFjZSBzZWN0aW9ucykgaW4gZGlzcGxheSBvcmRlciwgYnkgcmVvcmRlclxuXHQgKiBpZGVudGl0eS4gQ2FwdHVyZWQgZWFjaCByZW5kZXIgYW5kIHVzZWQgYXMgdGhlIGJhc2lzIGZvciBkcmFnLXJlb3JkZXIgbWF0aC5cblx0ICovXG5cdHByaXZhdGUgX3RvcExldmVsT3JkZXI6IHN0cmluZ1tdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRVcGRhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRVcGRhdGU6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRVcGRhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VGaW5kT3BlblN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmluZE9wZW5TdGF0ZTogRXZlbnQ8Ym9vbGVhbj4gPSB0aGlzLl9vbkRpZENoYW5nZUZpbmRPcGVuU3RhdGUuZXZlbnQ7XG5cblx0Z2V0IGVsZW1lbnQoKTogSFRNTEVsZW1lbnQgeyByZXR1cm4gdGhpcy5saXN0Q29udGFpbmVyOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IElTZXNzaW9uc0xpc3RDb250cm9sT3B0aW9ucyxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ3VzdG9tVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjdXN0b21WaWV3U2VydmljZTogSUN1c3RvbVZpZXdTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zTGlzdE1vZGVsU2VydmljZTogSVNlc3Npb25zTGlzdE1vZGVsU2VydmljZSxcblx0XHRASVNlc3Npb25Hcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25Hcm91cHNTZXJ2aWNlOiBJU2Vzc2lvbkdyb3Vwc1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uU2VjdGlvbk9yZGVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uU2VjdGlvbk9yZGVyU2VydmljZTogSVNlc3Npb25TZWN0aW9uT3JkZXJTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0RmlsdGVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RmlsdGVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElBdXRvbWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25TZXJ2aWNlOiBJQXV0b21hdGlvblNlcnZpY2UsXG5cdFx0QElWb2ljZVBsYXliYWNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9saXN0Vm9pY2VQbGF5YmFja1NlcnZpY2U6IElWb2ljZVBsYXliYWNrU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXNzaWdubWVudFNlcnZpY2U6IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUxheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJTGF5b3V0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIExvYWQgZXhjbHVkZWQgc2Vzc2lvbiB0eXBlcyBmcm9tIHN0b3JhZ2Vcblx0XHR0aGlzLmV4Y2x1ZGVkU2Vzc2lvblR5cGVzID0gdGhpcy5sb2FkRXhjbHVkZWRTZXNzaW9uVHlwZXMoKTtcblxuXHRcdC8vIExvYWQgZXhjbHVkZWQgc3RhdHVzZXMgZnJvbSBzdG9yYWdlXG5cdFx0dGhpcy5leGNsdWRlZFN0YXR1c2VzID0gdGhpcy5sb2FkRXhjbHVkZWRTdGF0dXNlcygpO1xuXG5cdFx0Ly8gTG9hZCBhcmNoaXZlZC9yZWFkIGZpbHRlciBzdGF0ZVxuXHRcdHRoaXMuX2V4Y2x1ZGVBcmNoaXZlZCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihTZXNzaW9uc0xpc3QuRVhDTFVERV9BUkNISVZFRF9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB0cnVlKTtcblx0XHR0aGlzLl9leGNsdWRlUmVhZCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihTZXNzaW9uc0xpc3QuRVhDTFVERV9SRUFEX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIGZhbHNlKTtcblx0XHR0aGlzLndvcmtzcGFjZUdyb3VwQ2FwcGVkID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKFNlc3Npb25zTGlzdC5XT1JLU1BBQ0VfR1JPVVBfQ0FQUEVEX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIHRydWUpO1xuXG5cdFx0dGhpcy5saXN0Q29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZXNzaW9ucy1saXN0LWNvbnRyb2wnKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmxpc3RDb250YWluZXIsIERPTS5FdmVudFR5cGUuUE9JTlRFUl9ET1dOLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmxpc3RDb250YWluZXIuY2xhc3NMaXN0LmFkZChTRVNTSU9OX1NFQ1RJT05fRk9DVVNfRlJPTV9QT0lOVEVSX0NMQVNTKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmxpc3RDb250YWluZXIub3duZXJEb2N1bWVudCwgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5saXN0Q29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoU0VTU0lPTl9TRUNUSU9OX0ZPQ1VTX0ZST01fUE9JTlRFUl9DTEFTUyk7XG5cdFx0fSwgdHJ1ZSkpO1xuXG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwpKTtcblx0XHRjb25zdCBtYXJrZG93blJlbmRlcmVyU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UpKTtcblx0XHRjb25zdCBob3ZlclNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSUhvdmVyU2VydmljZSkpO1xuXHRcdGNvbnN0IHNlc3Npb25zUHJvdmlkZXJzU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlID0gc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlO1xuXHRcdC8vIFJlLXJlbmRlciBzbyB0aGUgYWx3YXlzLXZpc2libGUgXCJDaGF0c1wiIHNlY3Rpb24gYXBwZWFycy9kaXNhcHBlYXJzIHdoZW4gYVxuXHRcdC8vIHF1aWNrLWNoYXQtY2FwYWJsZSBwcm92aWRlciBpcyAoZGUpcmVnaXN0ZXJlZCAoZS5nLiBhZ2VudCBob3N0IHRvZ2dsZWQpLFxuXHRcdC8vIG9yIHdoZW4gYSByZWdpc3RlcmVkIHByb3ZpZGVyIHRvZ2dsZXMgYSBjYXBhYmlsaXR5IGF0IHJ1bnRpbWUgKGUuZy4gaXRzXG5cdFx0Ly8gYHN1cHBvcnRzUXVpY2tDaGF0c2AgZmxpcHMgd2l0aCBhZ2VudC1ob3N0IGVuYWJsZW1lbnQpLlxuXHRcdGNvbnN0IHByb3ZpZGVyQ2FwYWJpbGl0eUxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3Qgc3Vic2NyaWJlUHJvdmlkZXJDYXBhYmlsaXRpZXMgPSAoKSA9PiB7XG5cdFx0XHRwcm92aWRlckNhcGFiaWxpdHlMaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2Ygc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVycygpKSB7XG5cdFx0XHRcdGlmIChwcm92aWRlci5vbkRpZENoYW5nZUNhcGFiaWxpdGllcykge1xuXHRcdFx0XHRcdHByb3ZpZGVyQ2FwYWJpbGl0eUxpc3RlbmVycy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRzdWJzY3JpYmVQcm92aWRlckNhcGFiaWxpdGllcygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5vbkRpZENoYW5nZVByb3ZpZGVycygoKSA9PiB7XG5cdFx0XHRzdWJzY3JpYmVQcm92aWRlckNhcGFiaWxpdGllcygpO1xuXHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihTRVNTSU9OU19MSVNUX1NIT1dfRU1QVFlfREVGQVVMVF9HUk9VUFNfU0VUVElORykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Ly8gVEVNUE9SQVJZICgjMzIwNDgwKTogc2VlIHRoZSBub3RlIG9uIHRoZSBgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlYCBpbXBvcnQuXG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uc1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlKSk7XG5cdFx0Y29uc3Qgdm9pY2VQbGF5YmFja1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSVZvaWNlUGxheWJhY2tTZXJ2aWNlKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlbmRlcmVyID0gdGhpcy5fc2Vzc2lvblJlbmRlcmVyID0gbmV3IFNlc3Npb25JdGVtUmVuZGVyZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGdyb3VwaW5nOiB0aGlzLm9wdGlvbnMuZ3JvdXBpbmcsXG5cdFx0XHRcdGlzUGlubmVkOiBzID0+IHRoaXMuaXNTZXNzaW9uUGlubmVkKHMpLFxuXHRcdFx0XHRpc1JlYWQ6IHMgPT4gcy5pc1JlYWQuZ2V0KCksXG5cdFx0XHRcdHZpc2libGVTZXNzaW9uczogdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLnZpc2libGVTZXNzaW9ucyxcblx0XHRcdFx0Z2V0TXVsdGlTZWxlY3RlZFNlc3Npb25zOiBzID0+IHRoaXMuZ2V0TXVsdGlTZWxlY3RlZFNlc3Npb25zKHMpLFxuXHRcdFx0XHRzaG93SG92ZXI6IHRydWUsXG5cdFx0XHRcdGFwcHJvdmFsUm93TWF4TGluZXM6IERFRkFVTFRfQVBQUk9WQUxfUk9XX01BWF9MSU5FUyxcblx0XHRcdFx0dG9vbGJhck1lbnVJZDogU2Vzc2lvbkl0ZW1Ub29sYmFyTWVudUlkLFxuXHRcdFx0XHRoYW5kbGVUb29sYmFyQWN0aW9uOiAoYWN0aW9uLCBzZXNzaW9uKSA9PiB0aGlzLmhhbmRsZVRvb2xiYXJBY3Rpb24oYWN0aW9uLCBzZXNzaW9uKSxcblx0XHRcdFx0b25EaWRSZXF1ZXN0UmVuYW1lOiBzZXNzaW9uID0+IHtcblx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFJFTkFNRV9TRVNTSU9OX0NPTU1BTkRfSUQsIHNlc3Npb24pLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRhcHByb3ZhbE1vZGVsLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZSxcblx0XHRcdG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdFx0aG92ZXJTZXJ2aWNlLFxuXHRcdFx0c2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0YWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0XHR2b2ljZVBsYXliYWNrU2VydmljZSxcblx0XHQpO1xuXG5cdFx0Y29uc3Qgc2hvd01vcmVSZW5kZXJlciA9IG5ldyBTZXNzaW9uU2hvd01vcmVSZW5kZXJlcigpO1xuXHRcdGNvbnN0IHBsYWNlaG9sZGVyUmVuZGVyZXIgPSBuZXcgU2Vzc2lvblBsYWNlaG9sZGVyUmVuZGVyZXIoaG92ZXJTZXJ2aWNlKTtcblx0XHRjb25zdCBzZWN0aW9uUmVuZGVyZXIgPSBuZXcgU2Vzc2lvblNlY3Rpb25SZW5kZXJlcih0cnVlIC8qIGhpZGVTZWN0aW9uQ291bnQgKi8sIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdGhpcy5hdXRvbWF0aW9uU2VydmljZSwgdGhpcy5fc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgdGhpcy5jdXN0b21WaWV3U2VydmljZSk7XG5cdFx0dGhpcy5fc2VjdGlvblJlbmRlcmVyID0gc2VjdGlvblJlbmRlcmVyO1xuXHRcdGNvbnN0IGdyb3VwUmVuZGVyZXIgPSBuZXcgU2Vzc2lvbkdyb3VwUmVuZGVyZXIoe1xuXHRcdFx0Y29tbWl0RWRpdDogKGdyb3VwLCBuYW1lKSA9PiB0aGlzLmNvbW1pdEdyb3VwRWRpdChncm91cCwgbmFtZSksXG5cdFx0XHRjYW5jZWxFZGl0OiBncm91cCA9PiB0aGlzLmNhbmNlbEdyb3VwRWRpdChncm91cCksXG5cdFx0fSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9ncm91cFJlbmRlcmVyID0gZ3JvdXBSZW5kZXJlcjtcblxuXHRcdC8vIFJlYWQgKGRvbid0IGJpbmQpIGBJc1Bob25lTGF5b3V0Q29udGV4dGAgZnJvbSB0aGUgcGFyZW50IGNvbnRleHQgc28gd2Vcblx0XHQvLyBvYnNlcnZlIHRoZSB3b3JrYmVuY2gncyB2YWx1ZSByYXRoZXIgdGhhbiBzaGFkb3dpbmcgaXQgd2l0aCBhIGZyZXNoXG5cdFx0Ly8gc2NvcGVkIGRlZmF1bHQgb2YgYGZhbHNlYC4gVGhlIHJlYWN0aXZlIGhlaWdodCByZWZyZXNoIGJlbG93IGxpc3RlbnNcblx0XHQvLyBvbiB0aGUgc2FtZSBzY29wZWQgc2VydmljZSBmb3IgY2hhbmdlcy5cblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBTZXNzaW9uc1RyZWVEZWxlZ2F0ZShhcHByb3ZhbE1vZGVsLCAoKSA9PiAhIUlzUGhvbmVMYXlvdXRDb250ZXh0LmdldFZhbHVlKGNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cblx0XHR0aGlzLnRyZWUgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaE9iamVjdFRyZWU8U2Vzc2lvbkxpc3RJdGVtLCBGdXp6eVNjb3JlPixcblx0XHRcdCdTZXNzaW9uc0xpc3RUcmVlJyxcblx0XHRcdHRoaXMubGlzdENvbnRhaW5lcixcblx0XHRcdGRlbGVnYXRlLFxuXHRcdFx0W1xuXHRcdFx0XHRzZXNzaW9uUmVuZGVyZXIsXG5cdFx0XHRcdHNlY3Rpb25SZW5kZXJlcixcblx0XHRcdFx0Z3JvdXBSZW5kZXJlcixcblx0XHRcdFx0c2hvd01vcmVSZW5kZXJlcixcblx0XHRcdFx0cGxhY2Vob2xkZXJSZW5kZXJlcixcblx0XHRcdF0sXG5cdFx0XHR7XG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IFNlc3Npb25zQWNjZXNzaWJpbGl0eVByb3ZpZGVyKHNlY3Rpb25SZW5kZXJlci5hdXRvbWF0aW9uU3RhdHVzKSxcblx0XHRcdFx0ZG5kOiB0aGlzLl9yZWdpc3RlcihuZXcgU2Vzc2lvbnNMaXN0RHJhZ0FuZERyb3Aoe1xuXHRcdFx0XHRcdGlzUmVvcmRlcmFibGU6IHNlc3Npb24gPT4gdGhpcy5pc1Jlb3JkZXJhYmxlKHNlc3Npb24pLFxuXHRcdFx0XHRcdGlzU2Vzc2lvblBpbm5lZDogc2Vzc2lvbiA9PiB0aGlzLmlzU2Vzc2lvblBpbm5lZChzZXNzaW9uKSxcblx0XHRcdFx0XHRjYW5Ecm9wT246IChkcmFnZ2VkLCB0YXJnZXQpID0+IHRoaXMuY2FuUmVvcmRlck9udG8oZHJhZ2dlZCwgdGFyZ2V0KSxcblx0XHRcdFx0XHRyZW9yZGVyOiAoZHJhZ2dlZCwgdGFyZ2V0LCBwb3NpdGlvbikgPT4gdGhpcy5yZW9yZGVyU2Vzc2lvbnMoZHJhZ2dlZCwgdGFyZ2V0LCBwb3NpdGlvbiksXG5cdFx0XHRcdFx0Z2V0R3JvdXBJZE9mU2Vzc2lvbjogc2Vzc2lvbiA9PiB0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCksXG5cdFx0XHRcdFx0YWRkU2Vzc2lvbnNUb0dyb3VwOiAoc2Vzc2lvbnMsIGdyb3VwSWQsIHRhcmdldCwgcG9zaXRpb24pID0+IHRoaXMuYWRkU2Vzc2lvbnNUb0dyb3VwKHNlc3Npb25zLCBncm91cElkLCB0YXJnZXQsIHBvc2l0aW9uKSxcblx0XHRcdFx0XHRwaW5TZXNzaW9uczogKHNlc3Npb25zLCB0YXJnZXQsIHBvc2l0aW9uKSA9PiB0aGlzLnBpblNlc3Npb25zKHNlc3Npb25zLCB0YXJnZXQsIHBvc2l0aW9uKSxcblx0XHRcdFx0XHRzZXREcm9wVGFyZ2V0SGVhZGVyOiBoZWFkZXIgPT4gdGhpcy5zZXREcm9wVGFyZ2V0SGVhZGVyKGhlYWRlciksXG5cdFx0XHRcdFx0cmVvcmRlclNlY3Rpb246IChkcmFnZ2VkSWQsIHRhcmdldElkLCBwb3NpdGlvbiwgaXNXb3Jrc3BhY2UpID0+IHRoaXMucmVvcmRlclNlY3Rpb24oZHJhZ2dlZElkLCB0YXJnZXRJZCwgcG9zaXRpb24sIGlzV29ya3NwYWNlKSxcblx0XHRcdFx0fSkpLFxuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0SWQ6IChlbGVtZW50OiBTZXNzaW9uTGlzdEl0ZW0pID0+IHtcblx0XHRcdFx0XHRcdGlmIChpc1Nlc3Npb25Hcm91cEl0ZW0oZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGBncm91cDoke2VsZW1lbnQuZ3JvdXAuaWR9YDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChpc1Nlc3Npb25TZWN0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBgc2VjdGlvbjoke2VsZW1lbnQuaWR9YDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChpc1Nlc3Npb25TaG93TW9yZShlbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYHNob3ctbW9yZToke2VsZW1lbnQua2luZH06JHtlbGVtZW50Lm1vZGV9OiR7ZWxlbWVudC5zZWN0aW9uSWR9YDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChpc1Nlc3Npb25QbGFjZWhvbGRlcihlbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYHBsYWNlaG9sZGVyOiR7ZWxlbWVudC5zZWN0aW9uSWR9YDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRHcm91cElkOiAoZWxlbWVudDogU2Vzc2lvbkxpc3RJdGVtKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoaXNTZXNzaW9uR3JvdXBJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBOb3RTZWxlY3RhYmxlR3JvdXBJZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChpc1Nlc3Npb25TZWN0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBOb3RTZWxlY3RhYmxlR3JvdXBJZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChpc1Nlc3Npb25TaG93TW9yZShlbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gTm90U2VsZWN0YWJsZUdyb3VwSWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoaXNTZXNzaW9uUGxhY2Vob2xkZXIoZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIE5vdFNlbGVjdGFibGVHcm91cElkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Ly8gVXNlIGEgZGlzdGluY3QgZ3JvdXAgZm9yIGFyY2hpdmVkIChkb25lKSBzZXNzaW9ucyBzbyB0aGF0XG5cdFx0XHRcdFx0XHQvLyBtdWx0aS1zZWxlY3Rpb24gY2Fubm90IHNwYW4gdGhlIHdvcmtzcGFjZSBhbmQgZG9uZSBzZWN0aW9ucy5cblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmlzQXJjaGl2ZWQuZ2V0KCkgPyAyIDogMTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IHRydWUsXG5cdFx0XHRcdGluZGVudDogMCxcblx0XHRcdFx0ZmluZFdpZGdldEVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGRlZmF1bHRGaW5kTW9kZTogVHJlZUZpbmRNb2RlLkZpbHRlcixcblx0XHRcdFx0ZmluZFdpZGdldENvbnRhaW5lcjogdGhpcy5vcHRpb25zLmZpbmRXaWRnZXRDb250YWluZXIsXG5cdFx0XHRcdGZpbmRXaWRnZXRTdHlsZXM6IHtcblx0XHRcdFx0XHQuLi5kZWZhdWx0RmluZFdpZGdldFN0eWxlcyxcblx0XHRcdFx0XHR0b2dnbGVTdHlsZXM6IHtcblx0XHRcdFx0XHRcdC4uLmRlZmF1bHRUb2dnbGVTdHlsZXMsXG5cdFx0XHRcdFx0XHRpbnB1dEFjdGl2ZU9wdGlvbkJvcmRlcjogJ3RyYW5zcGFyZW50Jyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWw6IChlbGVtZW50OiBTZXNzaW9uTGlzdEl0ZW0pID0+IHtcblx0XHRcdFx0XHRcdGlmIChpc1Nlc3Npb25Hcm91cEl0ZW0oZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuZ3JvdXAubmFtZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChpc1Nlc3Npb25TZWN0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmxhYmVsO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGlzU2Vzc2lvblNob3dNb3JlKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LnNlY3Rpb25MYWJlbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChpc1Nlc3Npb25QbGFjZWhvbGRlcihlbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5sYWJlbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LnRpdGxlLmdldCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b3ZlcnJpZGVTdHlsZXM6IHRoaXMub3B0aW9ucy5vdmVycmlkZVN0eWxlcyxcblx0XHRcdFx0cmVuZGVySW5kZW50R3VpZGVzOiBSZW5kZXJJbmRlbnRHdWlkZXMuTm9uZSxcblx0XHRcdFx0dHdpc3RpZUFkZGl0aW9uYWxDc3NDbGFzczogKCkgPT4gJ2ZvcmNlLW5vLXR3aXN0aWUnLFxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkT3BlbihlID0+IHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBlLmVsZW1lbnQ7XG5cdFx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzU2Vzc2lvblNob3dNb3JlKGVsZW1lbnQpKSB7XG5cdFx0XHRcdGlmIChlbGVtZW50LmtpbmQgPT09ICdmb2xkZXJzJykge1xuXHRcdFx0XHRcdHRoaXMuZXhwYW5kZWRNb3JlRm9sZGVycyA9IGVsZW1lbnQubW9kZSA9PT0gJ21vcmUnO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChlbGVtZW50Lm1vZGUgPT09ICdtb3JlJykge1xuXHRcdFx0XHRcdFx0dGhpcy5leHBhbmRlZFNlc3Npb25Hcm91cHMuYWRkKGVsZW1lbnQuc2VjdGlvbklkKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5leHBhbmRlZFNlc3Npb25Hcm91cHMuZGVsZXRlKGVsZW1lbnQuc2VjdGlvbklkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzU2Vzc2lvblBsYWNlaG9sZGVyKGVsZW1lbnQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChpc1Nlc3Npb25TZWN0aW9uKGVsZW1lbnQpICYmIGVsZW1lbnQuaWQgPT09IEFVVE9NQVRJT05TX1NFQ1RJT05fSUQpIHtcblx0XHRcdFx0dGhpcy50cmVlLnNldFNlbGVjdGlvbihbXSk7XG5cdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3Nlc3Npb25zVmlldy5tYW5hZ2VBdXRvbWF0aW9ucycpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzU2Vzc2lvblNlY3Rpb24oZWxlbWVudCkgJiYgIWlzU2Vzc2lvbkdyb3VwSXRlbShlbGVtZW50KSkge1xuXHRcdFx0XHR0aGlzLm1hcmtSZWFkKGVsZW1lbnQpO1xuXHRcdFx0XHQvLyBBIGRlbGliZXJhdGUgbGVmdCBtb3VzZSBjbGljayBvbiBhIHNlc3Npb24gc2hvdWxkIG1vdmUga2V5Ym9hcmRcblx0XHRcdFx0Ly8gZm9jdXMgaW50byB0aGUgY2hhdCBpbnB1dCBzbyB0aGUgdXNlciBjYW4gc3RhcnQgdHlwaW5nIHJpZ2h0XG5cdFx0XHRcdC8vIGF3YXkuIEEgc2luZ2xlIGNsaWNrIGFsd2F5cyByZXBvcnRzIGBwcmVzZXJ2ZUZvY3VzOiB0cnVlYCwgc29cblx0XHRcdFx0Ly8gZGV0ZWN0IHRoZSBtb3VzZSBjbGljayBleHBsaWNpdGx5LiBLZXlib2FyZCBuYXZpZ2F0aW9uIGtlZXBzXG5cdFx0XHRcdC8vIGBwcmVzZXJ2ZUZvY3VzYCBhcyByZXBvcnRlZCBzbyBicm93c2luZyB0aGUgbGlzdCBuZXZlciBzdGVhbHNcblx0XHRcdFx0Ly8gZm9jdXMgZnJvbSBpdC5cblx0XHRcdFx0Y29uc3QgaXNMZWZ0Q2xpY2sgPSBET00uaXNNb3VzZUV2ZW50KGUuYnJvd3NlckV2ZW50KSAmJiBlLmJyb3dzZXJFdmVudC5idXR0b24gPT09IDA7XG5cdFx0XHRcdGNvbnN0IHByZXNlcnZlRm9jdXMgPSBpc0xlZnRDbGljayA/IGZhbHNlIDogKGUuZWRpdG9yT3B0aW9ucy5wcmVzZXJ2ZUZvY3VzID8/IGZhbHNlKTtcblx0XHRcdFx0dGhpcy5vcHRpb25zLm9uU2Vzc2lvbk9wZW4oZWxlbWVudC5yZXNvdXJjZSwgcHJlc2VydmVGb2N1cywgZS5zaWRlQnlTaWRlKTtcblx0XHRcdFx0Ly8gSWYgdGhpcyBzZXNzaW9uIGhhcyBhbiB1bmhlYXJkIHZvaWNlIHJlc3BvbnNlLCBvcGVuaW5nIGl0IG1heSBub3Rcblx0XHRcdFx0Ly8gY2hhbmdlIHRoZSBhY3RpdmUtc2Vzc2lvbiBvYnNlcnZhYmxlIChpdCBjYW4gYWxyZWFkeSBiZSB0aGUgYWN0aXZlXG5cdFx0XHRcdC8vIHNlc3Npb24sIGp1c3Qgbm90IGZvY3VzZWQpLCBzbyB0aGUgdm9pY2UgY29udHJvbGxlciB3b3VsZCBuZXZlclxuXHRcdFx0XHQvLyByZS1hY3RpdmF0ZSBpdC4gQXNrIGl0IHRvIG5hcnJhdGUgdGhlIHBlbmRpbmcgaXRlbSBleHBsaWNpdGx5LlxuXHRcdFx0XHRpZiAodGhpcy5fbGlzdFZvaWNlUGxheWJhY2tTZXJ2aWNlLmhhc1BlbmRpbmdSZXNwb25zZShlbGVtZW50LnJlc291cmNlKSkge1xuXHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ19jaGF0LnZvaWNlLmFjdGl2YXRlU2Vzc2lvbicsIGVsZW1lbnQucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihzZXNzaW9uUmVuZGVyZXIub25EaWRDaGFuZ2VJdGVtSGVpZ2h0KHNlc3Npb24gPT4ge1xuXHRcdFx0aWYgKHRoaXMudHJlZS5oYXNFbGVtZW50KHNlc3Npb24pKSB7XG5cdFx0XHRcdHRoaXMudHJlZS51cGRhdGVFbGVtZW50SGVpZ2h0KHNlc3Npb24sIGRlbGVnYXRlLmdldEhlaWdodChzZXNzaW9uKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVhY3QgdG8gcGhvbmUgPC0+IGRlc2t0b3Agdmlld3BvcnQgdHJhbnNpdGlvbnM6IHJlZnJlc2ggaGVpZ2h0c1xuXHRcdC8vIGZvciBhbGwga25vd24gc2Vzc2lvbnMgc28gdGhlIHZpcnR1YWwgbGlzdCByZXNlcnZlcyB0aGUgY29ycmVjdFxuXHRcdC8vIHNwYWNlIGZvciB0aGUgbmV3IGxheW91dC4gSXRlcmF0ZXMgYHRoaXMuc2Vzc2lvbnNgIChhbGwga25vd25cblx0XHQvLyBzZXNzaW9ucykgXHUyMDE0IGEgcGhvbmUvZGVza3RvcCB0cmFuc2l0aW9uIGlzIGEgcmFyZSBldmVudCBzbyB0aGVcblx0XHQvLyBleHRyYSB3b3JrIG92ZXIgZmlsdGVyZWQtb3V0IHNlc3Npb25zIGlzIG5lZ2xpZ2libGUuIFJlbGllcyBvblxuXHRcdC8vIHRoZSBgSXNQaG9uZUxheW91dENvbnRleHRgIHJlYWN0aXZlIHNpZ25hbCBhbHJlYWR5IG1haW50YWluZWQgYnlcblx0XHQvLyB0aGUgYWdlbnRzIHdvcmtiZW5jaC5cblx0XHRjb25zdCBwaG9uZUtleXMgPSBuZXcgU2V0PHN0cmluZz4oW0lzUGhvbmVMYXlvdXRDb250ZXh0LmtleV0pO1xuXHRcdGNvbnN0IGF1dG9tYXRpb25LZXlzID0gbmV3IFNldDxzdHJpbmc+KFtDaGF0QXV0b21hdGlvbnNFbmFibGVkQ29udGV4dC5rZXldKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKGF1dG9tYXRpb25LZXlzKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFlLmFmZmVjdHNTb21lKHBob25lS2V5cykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuc2Vzc2lvbnMpIHtcblx0XHRcdFx0aWYgKHRoaXMudHJlZS5oYXNFbGVtZW50KHNlc3Npb24pKSB7XG5cdFx0XHRcdFx0dGhpcy50cmVlLnVwZGF0ZUVsZW1lbnRIZWlnaHQoc2Vzc2lvbiwgZGVsZWdhdGUuZ2V0SGVpZ2h0KHNlc3Npb24pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkNvbnRleHRNZW51KGUgPT4gdGhpcy5vbkNvbnRleHRNZW51KGUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlKGUgPT4ge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGUubm9kZS5lbGVtZW50O1xuXHRcdFx0aWYgKGVsZW1lbnQgJiYgaXNTZXNzaW9uR3JvdXBJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRcdHRoaXMuX2dyb3VwUmVuZGVyZXIudXBkYXRlQ29sbGFwc2VTdGF0ZShlbGVtZW50LCBlLm5vZGUuY29sbGFwc2VkKTtcblx0XHRcdFx0aWYgKCF0aGlzLnN1c3BlbmRDb2xsYXBzZVN0YXRlUGVyc2lzdGVuY2UpIHtcblx0XHRcdFx0XHR0aGlzLnNhdmVTZWN0aW9uQ29sbGFwc2VTdGF0ZShgZ3JvdXA6JHtlbGVtZW50Lmdyb3VwLmlkfWAsIGUubm9kZS5jb2xsYXBzZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQgJiYgaXNTZXNzaW9uU2VjdGlvbihlbGVtZW50KSkge1xuXHRcdFx0XHRzZWN0aW9uUmVuZGVyZXIudXBkYXRlQ29sbGFwc2VTdGF0ZShlbGVtZW50LCBlLm5vZGUuY29sbGFwc2VkKTtcblx0XHRcdFx0aWYgKCF0aGlzLnN1c3BlbmRDb2xsYXBzZVN0YXRlUGVyc2lzdGVuY2UpIHtcblx0XHRcdFx0XHR0aGlzLnNhdmVTZWN0aW9uQ29sbGFwc2VTdGF0ZShlbGVtZW50LmlkLCBlLm5vZGUuY29sbGFwc2VkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGxldCBpc0ZpbmRPcGVuID0gZmFsc2U7XG5cdFx0bGV0IGZpbmRQYXR0ZXJuID0gJyc7XG5cdFx0Y29uc3QgdXBkYXRlRmluZFBhdHRlcm5TdGF0ZSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGhhc0ZpbmRQYXR0ZXJuID0gaXNGaW5kT3BlbiAmJiBmaW5kUGF0dGVybi5sZW5ndGggPiAwO1xuXHRcdFx0aWYgKGhhc0ZpbmRQYXR0ZXJuICE9PSB0aGlzLmhhc0ZpbmRQYXR0ZXJuKSB7XG5cdFx0XHRcdHRoaXMuaGFzRmluZFBhdHRlcm4gPSBoYXNGaW5kUGF0dGVybjtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkQ2hhbmdlRmluZE9wZW5TdGF0ZShvcGVuID0+IHtcblx0XHRcdGlzRmluZE9wZW4gPSBvcGVuO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VGaW5kT3BlblN0YXRlLmZpcmUob3Blbik7XG5cdFx0XHR1cGRhdGVGaW5kUGF0dGVyblN0YXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gT25seSB0cmVhdCB0aGUgZmluZCBhcyBcImFjdGl2ZVwiIGZvciBsYXlvdXQgcHVycG9zZXMgKGJ5cGFzc2luZyB3b3Jrc3BhY2Vcblx0XHQvLyBjYXBwaW5nIGFuZCBwZXItZ3JvdXAgbGltaXRzKSBvbmNlIHRoZSB1c2VyIGhhcyBhY3R1YWxseSB0eXBlZCBhIHBhdHRlcm5cblx0XHQvLyBhbmQgdGhlIGZpbmQgd2lkZ2V0IGlzIG9wZW4uIE9wZW5pbmcgdGhlIGVtcHR5IGZpbmQgd2lkZ2V0IHNob3VsZCBub3Rcblx0XHQvLyByZW9yZGVyIHRoZSBsaXN0LCBhbmQgY2xvc2luZyBmaW5kIHNob3VsZCByZXN0b3JlIHRoZSBjYXBwZWQgbGF5b3V0LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZENoYW5nZUZpbmRQYXR0ZXJuKHBhdHRlcm4gPT4ge1xuXHRcdFx0ZmluZFBhdHRlcm4gPSBwYXR0ZXJuO1xuXHRcdFx0dXBkYXRlRmluZFBhdHRlcm5TdGF0ZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IHtcblx0XHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdFx0dGhpcy5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBBIHJlbW92ZWQgc2Vzc2lvbiBtYXkgaGF2ZSBiZWVuIHRoZSBsYXN0IG9uZSBpbiBpdHMgd29ya3NwYWNlLlxuXHRcdFx0Ly8gR2FyYmFnZS1jb2xsZWN0IG1hbnVhbCBvcmRlciAvIHByb21vdGlvbiBlbnRyaWVzIGZvciBpZGVudGl0aWVzXG5cdFx0XHQvLyB0aGF0IG5vIGxvbmdlciBleGlzdC4gVGhpcyBydW5zIG9ubHkgb24gcmVtb3ZhbHMgKG5ldmVyIG9uXG5cdFx0XHQvLyBhZGRpdGlvbnMgb3IgdGhlIGluaXRpYWwgbG9hZCkgc28gdGhhdCBhc3luY2hyb25vdXMgc2Vzc2lvblxuXHRcdFx0Ly8gbG9hZGluZyBvbiBhIHdpbmRvdyByZWxvYWQgY2FuIG5ldmVyIHBydW5lIHRoZSB1c2VyJ3MgbWFudWFsXG5cdFx0XHQvLyBvcmRlcmluZyBvZiB3b3Jrc3BhY2VzIHJlbGF0aXZlIHRvIGdyb3VwcyBiZWZvcmUgdGhlaXIgc2Vzc2lvbnNcblx0XHRcdC8vIGhhdmUgbG9hZGVkLlxuXHRcdFx0aWYgKGUucmVtb3ZlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25TZWN0aW9uT3JkZXJTZXJ2aWNlLnJldGFpbih0aGlzLmxpdmVTZWN0aW9uT3JkZXJJZHMoKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHRcdC8vIEdhcmJhZ2UtY29sbGVjdCBtYW51YWwgb3JkZXIgLyBwcm9tb3Rpb24gZW50cmllcyB3aGVuIGdyb3VwcyBhcmVcblx0XHRcdC8vIGRlbGV0ZWQuIEdyb3VwIGNoYW5nZXMgYXJlIHVzZXItZHJpdmVuIGFuZCBoYXBwZW4gYWZ0ZXJcblx0XHRcdC8vIHNlc3Npb25zIGhhdmUgbG9hZGVkLCBzbyBwcnVuaW5nIGhlcmUgaXMgc2FmZSAodW5saWtlIGF0IHJlbmRlclxuXHRcdFx0Ly8gdGltZSBkdXJpbmcgdGhlIGFzeW5jaHJvbm91cyBpbml0aWFsIGxvYWQpLlxuXHRcdFx0aWYgKGUuZ3JvdXBzQ2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uU2VjdGlvbk9yZGVyU2VydmljZS5yZXRhaW4odGhpcy5saXZlU2VjdGlvbk9yZGVySWRzKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Nlc3Npb25TZWN0aW9uT3JkZXJTZXJ2aWNlLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiB0aGUgYWN0aXZlIHNlc3Npb24gY2hhbmdlcy5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVzb2x2ZSB0aGUgcGVyLWdyb3VwIHNlc3Npb24gbGltaXQgZnJvbSB0aGUgZXhwZXJpbWVudCBzZXJ2aWNlIGFuZFxuXHRcdC8vIGtlZXAgaXQgY3VycmVudCB3aGVuIHRyZWF0bWVudHMgYXJlIHJlZmV0Y2hlZC4gVGhlIGFzeW5jIGZldGNoIGlzXG5cdFx0Ly8gY29uZmluZWQgdG8gYHVwZGF0ZVNlc3Npb25Hcm91cExpbWl0YDsgdGhlIHJlc3Qgb2YgdGhlIGxpc3QgcmVhZHMgdGhlXG5cdFx0Ly8gcmVzb2x2ZWQgdmFsdWUgc3luY2hyb25vdXNseSBvZmYgYHNlc3Npb25Hcm91cExpbWl0YC4gVGhlIGF1dG9ydW4gcnVuc1xuXHRcdC8vIGltbWVkaWF0ZWx5IGZvciB0aGUgaW5pdGlhbCBmZXRjaCBhbmQgYWdhaW4gd2hlbmV2ZXIgdHJlYXRtZW50cyByZWZldGNoLlxuXHRcdGNvbnN0IGFzc2lnbm1lbnRSZWZldGNoU2lnbmFsID0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCh0aGlzLCB0aGlzLmFzc2lnbm1lbnRTZXJ2aWNlLm9uRGlkUmVmZXRjaEFzc2lnbm1lbnRzKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRhc3NpZ25tZW50UmVmZXRjaFNpZ25hbC5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLnVwZGF0ZVNlc3Npb25Hcm91cExpbWl0KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5yZWZyZXNoKCk7XG5cdH1cblxuXHQvKipcblx0ICogRmV0Y2hlcyB0aGUgc2Vzc2lvbiBncm91cCBsaW1pdCB0cmVhdG1lbnQgYW5kIHVwZGF0ZXMgdGhlIGJhY2tpbmdcblx0ICogb2JzZXJ2YWJsZS4gSW52YWxpZCBvciB1bnNldCB0cmVhdG1lbnRzIGZhbGwgYmFjayB0byB0aGUgZGVmYXVsdCBsaW1pdC5cblx0ICovXG5cdHByaXZhdGUgdXBkYXRlU2Vzc2lvbkdyb3VwTGltaXQoKTogdm9pZCB7XG5cdFx0dGhpcy5hc3NpZ25tZW50U2VydmljZS5nZXRUcmVhdG1lbnQ8bnVtYmVyPihTZXNzaW9uc0xpc3QuU0VTU0lPTl9HUk9VUF9MSU1JVF9UUkVBVE1FTlQpLnRoZW4odmFsdWUgPT4ge1xuXHRcdFx0Y29uc3QgbGltaXQgPSB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIE51bWJlci5pc0ludGVnZXIodmFsdWUpICYmIHZhbHVlID4gMFxuXHRcdFx0XHQ/IHZhbHVlXG5cdFx0XHRcdDogU2Vzc2lvbnNMaXN0LkRFRkFVTFRfU0VTU0lPTl9HUk9VUF9MSU1JVDtcblx0XHRcdGlmICh0aGlzLnNlc3Npb25Hcm91cExpbWl0LmdldCgpICE9PSBsaW1pdCkge1xuXHRcdFx0XHR0aGlzLnNlc3Npb25Hcm91cExpbWl0LnNldChsaW1pdCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0aWYgKHRoaXMudmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJlZnJlc2goKTogdm9pZCB7XG5cdFx0dGhpcy5zZXNzaW9ucyA9IHRoaXMuX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbnMoKTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5zZXNzaW9ucykge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLm1pZ3JhdGVMZWdhY3lSZWFkU3RhdGUoc2Vzc2lvbik7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoZXhwYW5kQWxsPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblxuXHRcdC8vIEZpbHRlciBieSBzZXNzaW9uIHR5cGUgYW5kIHN0YXR1c1xuXHRcdGxldCBmaWx0ZXJlZCA9IHRoaXMuc2Vzc2lvbnM7XG5cdFx0Y29uc3QgaG9zdEZpbHRlciA9IHRoaXMuX2FnZW50SG9zdEZpbHRlclNlcnZpY2Uuc2VsZWN0ZWRQcm92aWRlcklkO1xuXHRcdGlmIChob3N0RmlsdGVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGZpbHRlcmVkID0gZmlsdGVyZWQuZmlsdGVyKHMgPT4gcy5wcm92aWRlcklkID09PSBob3N0RmlsdGVyKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXhjbHVkZWRTZXNzaW9uVHlwZXMuc2l6ZSA+IDApIHtcblx0XHRcdGZpbHRlcmVkID0gZmlsdGVyZWQuZmlsdGVyKHMgPT4gIXRoaXMuZXhjbHVkZWRTZXNzaW9uVHlwZXMuaGFzKHMuc2Vzc2lvblR5cGUpKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXhjbHVkZWRTdGF0dXNlcy5zaXplID4gMCkge1xuXHRcdFx0ZmlsdGVyZWQgPSBmaWx0ZXJlZC5maWx0ZXIocyA9PiAhdGhpcy5leGNsdWRlZFN0YXR1c2VzLmhhcyhzLnN0YXR1cy5nZXQoKSkpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZXhjbHVkZUFyY2hpdmVkKSB7XG5cdFx0XHRmaWx0ZXJlZCA9IGZpbHRlcmVkLmZpbHRlcihzID0+ICFzLmlzQXJjaGl2ZWQuZ2V0KCkpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZXhjbHVkZVJlYWQpIHtcblx0XHRcdGZpbHRlcmVkID0gZmlsdGVyZWQuZmlsdGVyKHMgPT4gIXMuaXNSZWFkLmdldCgpKTtcblx0XHR9XG5cblx0XHQvLyBBbHdheXMgaW5jbHVkZSB0aGUgYWN0aXZlIHNlc3Npb24gZXZlbiBpZiBpdCB3YXMgZmlsdGVyZWQgb3V0LFxuXHRcdC8vIHNvIGl0IHJlbWFpbnMgdmlzaWJsZSB3aGlsZSBzZWxlY3RlZFxuXHRcdGlmIChhY3RpdmVTZXNzaW9uICYmICFmaWx0ZXJlZC5zb21lKHMgPT4gcy5zZXNzaW9uSWQgPT09IGFjdGl2ZVNlc3Npb24uc2Vzc2lvbklkKSkge1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSB0aGlzLnNlc3Npb25zLmZpbmQocyA9PiBzLnNlc3Npb25JZCA9PT0gYWN0aXZlU2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRcdGZpbHRlcmVkID0gWy4uLmZpbHRlcmVkLCBtYXRjaF07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ3JvdXBpbmcgPSB0aGlzLm9wdGlvbnMuZ3JvdXBpbmcoKTtcblx0XHRjb25zdCBzb3J0aW5nID0gdGhpcy5vcHRpb25zLnNvcnRpbmcoKTtcblx0XHRjb25zdCBzb3J0S2V5Rm9yR3JvdXBpbmcgPSAoczogSVNlc3Npb24sIHNydDogU2Vzc2lvbnNTb3J0aW5nKSA9PiB0aGlzLl9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UuZ2V0U29ydEtleShzLCBzb3J0aW5nVG9Nb2RlKHNydCkpO1xuXG5cdFx0Ly8gUHVsbCByZWd1bGFyIChub24tcGlubmVkLCBub24tYXJjaGl2ZWQpIGdyb3VwZWQgc2Vzc2lvbnMgb3V0IG9mIHRoZVxuXHRcdC8vIG5vcm1hbCBkYXRlL3dvcmtzcGFjZSBzZWN0aW9uaW5nIHNvIHRoZXkgcmVuZGVyIHVuZGVyIHRoZWlyIGdyb3VwLlxuXHRcdC8vIFBpbm5lZCBhbmQgYXJjaGl2ZWQgc2Vzc2lvbnMga2VlcCB0aGVpciBwcmVjZWRlbmNlIGFuZCBzdGF5IGluIHRoZWlyXG5cdFx0Ly8gc2VjdGlvbnMgZXZlbiB3aGVuIHRoZXkgYmVsb25nIHRvIGEgZ3JvdXAgKHRoZWlyIG1lbWJlcnNoaXAgaXNcblx0XHQvLyByZXRhaW5lZCBzbyB0aGV5IHJldHVybiB0byB0aGUgZ3JvdXAgb25jZSB1bnBpbm5lZC9yZXN0b3JlZCkuXG5cdFx0Y29uc3QgZ3JvdXBlZE1lbWJlcnMgPSBuZXcgTWFwPHN0cmluZywgSVNlc3Npb25bXT4oKTtcblx0XHRjb25zdCBncm91cGVkUmVndWxhcklkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgcyBvZiBmaWx0ZXJlZCkge1xuXHRcdFx0aWYgKHMuaXNBcmNoaXZlZC5nZXQoKSB8fCB0aGlzLmlzU2Vzc2lvblBpbm5lZChzKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGdyb3VwSWQgPSB0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbihzLnNlc3Npb25JZCk7XG5cdFx0XHRpZiAoZ3JvdXBJZCAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX3Nlc3Npb25Hcm91cHNTZXJ2aWNlLmdldEdyb3VwKGdyb3VwSWQpKSB7XG5cdFx0XHRcdGxldCBtZW1iZXJzID0gZ3JvdXBlZE1lbWJlcnMuZ2V0KGdyb3VwSWQpO1xuXHRcdFx0XHRpZiAoIW1lbWJlcnMpIHtcblx0XHRcdFx0XHRtZW1iZXJzID0gW107XG5cdFx0XHRcdFx0Z3JvdXBlZE1lbWJlcnMuc2V0KGdyb3VwSWQsIG1lbWJlcnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1lbWJlcnMucHVzaChzKTtcblx0XHRcdFx0Z3JvdXBlZFJlZ3VsYXJJZHMuYWRkKHMuc2Vzc2lvbklkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgZm9yU2VjdGlvbnMgPSBncm91cGVkUmVndWxhcklkcy5zaXplID4gMCA/IGZpbHRlcmVkLmZpbHRlcihzID0+ICFncm91cGVkUmVndWxhcklkcy5oYXMocy5zZXNzaW9uSWQpKSA6IGZpbHRlcmVkO1xuXG5cdFx0Ly8gQnVpbGQgdGhlIGdyb3VwIGJsb2NrcyB3aXRoIG1lbWJlcnMgc29ydGVkIGJ5IHRoZSBub3JtYWwgc29ydCBsb2dpYy5cblx0XHQvLyBHcm91cHMgYXJlIGZ1bGx5IHVzZXItbWFuYWdlZDogdGhlaXIgb3JkZXIgaXMgb3duZWQgYnkgdGhlIHNlY3Rpb24tb3JkZXJcblx0XHQvLyBzZXJ2aWNlIChkZWZhdWx0aW5nIHRvIG5ld2VzdC1maXJzdCksIGluZGVwZW5kZW50IG9mIHRoZWlyIG1lbWJlcnMnXG5cdFx0Ly8gcmVjZW5jeSwgYW5kIGlzIHNoYXJlZCBhY3Jvc3MgYm90aCBncm91cGluZyBtb2Rlcy5cblx0XHRjb25zdCBncm91cEl0ZW1zQnlJZCA9IG5ldyBNYXA8c3RyaW5nLCBJU2Vzc2lvbkdyb3VwSXRlbT4oKTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuX3Nlc3Npb25Hcm91cHNTZXJ2aWNlLmdldEdyb3VwcygpKSB7XG5cdFx0XHRjb25zdCBtZW1iZXJzID0gZ3JvdXBlZE1lbWJlcnMuZ2V0KGdyb3VwLmlkKSA/PyBbXTtcblx0XHRcdGNvbnN0IHNvcnRlZE1lbWJlcnMgPSBzb3J0U2Vzc2lvbnMobWVtYmVycywgc29ydGluZywgc29ydEtleUZvckdyb3VwaW5nKTtcblx0XHRcdGdyb3VwSXRlbXNCeUlkLnNldChncm91cC5pZCwge1xuXHRcdFx0XHRncm91cCxcblx0XHRcdFx0c2Vzc2lvbnM6IHNvcnRlZE1lbWJlcnMsXG5cdFx0XHRcdGlzRW1wdHk6IHRoaXMuX3Nlc3Npb25Hcm91cHNTZXJ2aWNlLmdldFNlc3Npb25JZHNJbkdyb3VwKGdyb3VwLmlkKS5sZW5ndGggPT09IDAsXG5cdFx0XHRcdGVkaXRpbmc6IGdyb3VwLmlkID09PSB0aGlzLl9lZGl0aW5nR3JvdXBJZCxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRjb25zdCBkZWZhdWx0R3JvdXBJZHMgPSBbLi4uZ3JvdXBJdGVtc0J5SWQudmFsdWVzKCldXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gYi5ncm91cC5jcmVhdGVkQXQgLSBhLmdyb3VwLmNyZWF0ZWRBdClcblx0XHRcdC5tYXAoaXRlbSA9PiBgZ3JvdXA6JHtpdGVtLmdyb3VwLmlkfWApO1xuXG5cdFx0Y29uc3Qgc2VjdGlvbnMgPSBncm91cFNlc3Npb25zRm9yTGlzdChmb3JTZWN0aW9ucywgZ3JvdXBpbmcsIHNvcnRpbmcsIHNlc3Npb24gPT4gdGhpcy5pc1Nlc3Npb25QaW5uZWQoc2Vzc2lvbiksIChzLCBzcnQpID0+IHRoaXMuX3Nlc3Npb25zTGlzdE1vZGVsU2VydmljZS5nZXRTb3J0S2V5KHMsIHNvcnRpbmdUb01vZGUoc3J0KSkpO1xuXG5cdFx0Y29uc3QgaGFzUmVjZW50U2Vzc2lvbnMgPSBzZWN0aW9ucy5zb21lKHMgPT4gcy5pZCA9PT0gJ3JlY2VudCcgJiYgcy5zZXNzaW9ucy5sZW5ndGggPiAwKTtcblxuXHRcdC8vIEtlZXAgdGhlIFwiQ2hhdHNcIiBkZWZhdWx0IHNlY3Rpb24gdmlzaWJsZSBldmVuIHdoZW4gZW1wdHkgc28gaXQgc3RheXNcblx0XHQvLyBkaXNjb3ZlcmFibGUsIHVubGVzcyB0aGUgdXNlciBvcHRzIG91dCB2aWEgdGhlIHNldHRpbmcuIFRoZSBcIlBpbm5lZFwiXG5cdFx0Ly8gc2VjdGlvbiBpcyBvbmx5IHNob3duIHdoZW4gaXQgYWN0dWFsbHkgaGFzIHBpbm5lZCBzZXNzaW9ucy5cblx0XHRjb25zdCBzaG93RW1wdHlEZWZhdWx0R3JvdXBzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihTRVNTSU9OU19MSVNUX1NIT1dfRU1QVFlfREVGQVVMVF9HUk9VUFNfU0VUVElORyk7XG5cblx0XHQvLyBLZWVwIHRoZSBcIkNoYXRzXCIgc2VjdGlvbiBhbHdheXMgdmlzaWJsZSAoZXZlbiB3aXRoIG5vIHF1aWNrIGNoYXRzKSBzbyBpdHNcblx0XHQvLyBoZWFkZXIgXHUyMDE0IGxlYWRpbmcgY2hhdCBpY29uLCBsYWJlbCwgYW5kIHRoZSBcIitcIiBjcmVhdGUgYWN0aW9uIFx1MjAxNCBpcyBhbHdheXNcblx0XHQvLyByZWFjaGFibGUuIE9ubHkgd2hlbiBhIHByb3ZpZGVyIGNhbiBhY3R1YWxseSBzZXJ2ZSBxdWljayBjaGF0cy5cblx0XHRpZiAoc2hvd0VtcHR5RGVmYXVsdEdyb3VwcyAmJiB0aGlzLl9zb21lUHJvdmlkZXJTdXBwb3J0c1F1aWNrQ2hhdHMoKSAmJiAhc2VjdGlvbnMuc29tZShzID0+IHMuaWQgPT09IFFVSUNLX0NIQVRTX1NFQ1RJT05fSUQpKSB7XG5cdFx0XHRzZWN0aW9ucy5wdXNoKHsgaWQ6IFFVSUNLX0NIQVRTX1NFQ1RJT05fSUQsIGxhYmVsOiBsb2NhbGl6ZSgnY2hhdHNTZWN0aW9uJywgXCJDaGF0c1wiKSwgc2Vzc2lvbnM6IFtdIH0pO1xuXHRcdH1cblxuXHRcdC8vIFBhcnRpdGlvbiB3b3Jrc3BhY2Ugc2VjdGlvbnMgaW50byBcInByaW1hcnlcIiAobWVldHMgY3JpdGVyaWEpIGFuZCBcIm1vcmVcIlxuXHRcdC8vIHdoZW4gZ3JvdXBpbmcgYnkgd29ya3NwYWNlLiBBbiBhY3RpdmUgZmluZCBwYXR0ZXJuIGJ5cGFzc2VzIHBhcnRpdGlvbmluZ1xuXHRcdC8vIHNvIGFsbCBtYXRjaGluZyBzZXNzaW9ucyBhcmUgdmlzaWJsZS4gV2hlbiB0aGUgdXNlciBoYXMgY2hvc2VuXG5cdFx0Ly8gXCJTaG93IEFsbCBTZXNzaW9uc1wiICh1bmNhcHBlZCksIHNob3cgZXZlcnkgd29ya3NwYWNlIGdyb3VwIGlubGluZSBpbnN0ZWFkXG5cdFx0Ly8gb2YgaGlkaW5nIHNvbWUgYmVoaW5kIGEgXCJtb3JlIHdvcmtzcGFjZXNcIiBlbnRyeS5cblx0XHRjb25zdCBwYXJ0aXRpb25Gb2xkZXJzID0gZ3JvdXBpbmcgPT09IFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlICYmICF0aGlzLmhhc0ZpbmRQYXR0ZXJuICYmIHRoaXMud29ya3NwYWNlR3JvdXBDYXBwZWQ7XG5cdFx0Y29uc3QgbW9yZUZvbGRlclNlY3Rpb25JZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRpZiAocGFydGl0aW9uRm9sZGVycykge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlU2VjdGlvbnMgPSBzZWN0aW9ucy5maWx0ZXIocyA9PiBzLmlkLnN0YXJ0c1dpdGgoJ3dvcmtzcGFjZTonKSk7XG5cdFx0XHRpZiAod29ya3NwYWNlU2VjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0XHRjb25zdCBpc1JlY2VudCA9IChzZWN0aW9uOiBJU2Vzc2lvblNlY3Rpb24pID0+XG5cdFx0XHRcdFx0c2VjdGlvbi5zZXNzaW9ucy5zb21lKHMgPT4gcy51cGRhdGVkQXQuZ2V0KCkuZ2V0VGltZSgpID49IG5vdyAtIEZPVVJfREFZU19NUyk7XG5cdFx0XHRcdGNvbnN0IGlzT3BlbldpbmRvdyA9IChzZWN0aW9uOiBJU2Vzc2lvblNlY3Rpb24pID0+XG5cdFx0XHRcdFx0ISF0aGlzLm9wZW5XaW5kb3dTb3VyY2VGb2xkZXIgJiYgc2VjdGlvbi5zZXNzaW9ucy5zb21lKHMgPT4gc2Vzc2lvbk1hdGNoZXNGb2xkZXIocywgdGhpcy5vcGVuV2luZG93U291cmNlRm9sZGVyISkpO1xuXHRcdFx0XHRjb25zdCBtZWV0c0NyaXRlcmlhID0gKHNlY3Rpb246IElTZXNzaW9uU2VjdGlvbikgPT4gaXNSZWNlbnQoc2VjdGlvbikgfHwgaXNPcGVuV2luZG93KHNlY3Rpb24pO1xuXG5cdFx0XHRcdGxldCBhbnlNZWV0cyA9IGZhbHNlO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2Ygd29ya3NwYWNlU2VjdGlvbnMpIHtcblx0XHRcdFx0XHRpZiAobWVldHNDcml0ZXJpYShzZWN0aW9uKSkge1xuXHRcdFx0XHRcdFx0YW55TWVldHMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IGZhbGxiYWNrSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKCFhbnlNZWV0cykge1xuXHRcdFx0XHRcdC8vIENyaXRlcmlvbiAzOiBwaWNrIHRoZSBmb2xkZXIgd2l0aCB0aGUgbW9zdCByZWNlbnRseSB1cGRhdGVkIHNlc3Npb24uXG5cdFx0XHRcdFx0bGV0IGJlc3RUaW1lID0gLUluZmluaXR5O1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiB3b3Jrc3BhY2VTZWN0aW9ucykge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBzIG9mIHNlY3Rpb24uc2Vzc2lvbnMpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgdCA9IHMudXBkYXRlZEF0LmdldCgpLmdldFRpbWUoKTtcblx0XHRcdFx0XHRcdFx0aWYgKHQgPiBiZXN0VGltZSkge1xuXHRcdFx0XHRcdFx0XHRcdGJlc3RUaW1lID0gdDtcblx0XHRcdFx0XHRcdFx0XHRmYWxsYmFja0lkID0gc2VjdGlvbi5pZDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiB3b3Jrc3BhY2VTZWN0aW9ucykge1xuXHRcdFx0XHRcdGlmICghbWVldHNDcml0ZXJpYShzZWN0aW9uKSAmJiBzZWN0aW9uLmlkICE9PSBmYWxsYmFja0lkICYmICF0aGlzLl9zZXNzaW9uU2VjdGlvbk9yZGVyU2VydmljZS5pc1Byb21vdGVkKHNlY3Rpb24uaWQpKSB7XG5cdFx0XHRcdFx0XHRtb3JlRm9sZGVyU2VjdGlvbklkcy5hZGQoc2VjdGlvbi5pZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hpbGRyZW46IElPYmplY3RUcmVlRWxlbWVudDxTZXNzaW9uTGlzdEl0ZW0+W10gPSBbXTtcblxuXHRcdGNvbnN0IHNlc3Npb25Hcm91cExpbWl0ID0gdGhpcy5zZXNzaW9uR3JvdXBMaW1pdC5nZXQoKTtcblxuXHRcdGNvbnN0IHRvU2Vzc2lvbkNoaWxkcmVuID0gKHNlc3Npb25zOiByZWFkb25seSBJU2Vzc2lvbltdKTogSU9iamVjdFRyZWVFbGVtZW50PFNlc3Npb25MaXN0SXRlbT5bXSA9PlxuXHRcdFx0c2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gKHsgZWxlbWVudDogc2Vzc2lvbiBhcyBTZXNzaW9uTGlzdEl0ZW0gfSkpO1xuXG5cdFx0Y29uc3QgcmVuZGVyU2Vzc2lvbkNoaWxkcmVuID0gKHNlc3Npb25zOiByZWFkb25seSBJU2Vzc2lvbltdLCBzZWN0aW9uSWQ6IHN0cmluZywgc2VjdGlvbkxhYmVsOiBzdHJpbmcsIGVuYWJsZWQ6IGJvb2xlYW4pOiBJT2JqZWN0VHJlZUVsZW1lbnQ8U2Vzc2lvbkxpc3RJdGVtPltdID0+IHtcblx0XHRcdGNvbnN0IGxpbWl0ZWQgPSBsaW1pdFNlc3Npb25zRm9yTGlzdChzZXNzaW9ucywgc2Vzc2lvbkdyb3VwTGltaXQsIHtcblx0XHRcdFx0ZW5hYmxlZCxcblx0XHRcdFx0ZXhwYW5kZWQ6IHRoaXMuZXhwYW5kZWRTZXNzaW9uR3JvdXBzLmhhcyhzZWN0aW9uSWQpLFxuXHRcdFx0XHRzZWN0aW9uSWQsXG5cdFx0XHRcdHNlY3Rpb25MYWJlbCxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY2hpbGRyZW4gPSB0b1Nlc3Npb25DaGlsZHJlbihsaW1pdGVkLnNlc3Npb25zKTtcblx0XHRcdGlmIChsaW1pdGVkLnNob3dNb3JlKSB7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2goeyBlbGVtZW50OiBsaW1pdGVkLnNob3dNb3JlIH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNoaWxkcmVuO1xuXHRcdH07XG5cblx0XHRjb25zdCByZW5kZXJTZWN0aW9uID0gKHNlY3Rpb246IElTZXNzaW9uU2VjdGlvbik6IElPYmplY3RUcmVlRWxlbWVudDxTZXNzaW9uTGlzdEl0ZW0+ID0+IHtcblx0XHRcdGlmIChzZWN0aW9uLmlkID09PSBBVVRPTUFUSU9OU19TRUNUSU9OX0lEKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZWxlbWVudDogc2VjdGlvbiBhcyBTZXNzaW9uTGlzdEl0ZW0sXG5cdFx0XHRcdFx0Y2hpbGRyZW46IFtdLFxuXHRcdFx0XHRcdGNvbGxhcHNpYmxlOiBmYWxzZSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXNXb3Jrc3BhY2VHcm91cCA9IGdyb3VwaW5nID09PSBTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZVxuXHRcdFx0XHQmJiBzZWN0aW9uLmlkLnN0YXJ0c1dpdGgoJ3dvcmtzcGFjZTonKTtcblx0XHRcdGNvbnN0IGxpbWl0U2Vzc2lvbnMgPSBpc1dvcmtzcGFjZUdyb3VwXG5cdFx0XHRcdCYmICF0aGlzLmhhc0ZpbmRQYXR0ZXJuXG5cdFx0XHRcdCYmIHRoaXMud29ya3NwYWNlR3JvdXBDYXBwZWQ7XG5cdFx0XHRsZXQgc2VjdGlvbkNoaWxkcmVuID0gcmVuZGVyU2Vzc2lvbkNoaWxkcmVuKHNlY3Rpb24uc2Vzc2lvbnMsIHNlY3Rpb24uaWQsIHNlY3Rpb24ubGFiZWwsIGxpbWl0U2Vzc2lvbnMpO1xuXG5cdFx0XHQvLyBUaGUgYWx3YXlzLXZpc2libGUgXCJDaGF0c1wiIHNlY3Rpb24gc2hvd3MgYSBtdXRlZCBwbGFjZWhvbGRlciByb3dcblx0XHRcdC8vIHdoZW4gaXQgaGFzIG5vIHNlc3Npb25zIHlldC5cblx0XHRcdGlmIChzZWN0aW9uLmlkID09PSBRVUlDS19DSEFUU19TRUNUSU9OX0lEICYmIHNlY3Rpb24uc2Vzc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHNlY3Rpb25DaGlsZHJlbiA9IFt7IGVsZW1lbnQ6IHsgcGxhY2Vob2xkZXI6IHRydWUgYXMgY29uc3QsIHNlY3Rpb25JZDogc2VjdGlvbi5pZCwgbGFiZWw6IGxvY2FsaXplKCdub0NoYXRzJywgXCJObyBjaGF0c1wiKSB9IH1dO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEZWZhdWx0IGNvbGxhcHNlIHN0YXRlIGZvciBvbGRlciB0aW1lIHNlY3Rpb25zXG5cdFx0XHRsZXQgZGVmYXVsdENvbGxhcHNlZDogYm9vbGVhbiB8IE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZSA9IE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZS5QcmVzZXJ2ZU9yRXhwYW5kZWQ7XG5cdFx0XHRpZiAoZ3JvdXBpbmcgPT09IFNlc3Npb25zR3JvdXBpbmcuRGF0ZSAmJiBoYXNSZWNlbnRTZXNzaW9ucykge1xuXHRcdFx0XHRjb25zdCBvbGRlclNlY3Rpb25zID0gWydvbGRlcicsICdhcmNoaXZlZCddO1xuXHRcdFx0XHRpZiAob2xkZXJTZWN0aW9ucy5pbmNsdWRlcyhzZWN0aW9uLmlkKSkge1xuXHRcdFx0XHRcdGRlZmF1bHRDb2xsYXBzZWQgPSBPYmplY3RUcmVlRWxlbWVudENvbGxhcHNlU3RhdGUuUHJlc2VydmVPckNvbGxhcHNlZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHNlY3Rpb24uaWQgPT09ICdhcmNoaXZlZCcpIHtcblx0XHRcdFx0ZGVmYXVsdENvbGxhcHNlZCA9IE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZS5QcmVzZXJ2ZU9yQ29sbGFwc2VkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUaGUgXCJQaW5uZWRcIiBhbmQgXCJDaGF0c1wiIHNlY3Rpb25zIHN0YXJ0IGNvbGxhcHNlZCBvbiBmaXJzdCBvcGVuOyB0aGVcblx0XHRcdC8vIHVzZXIncyBsYXRlciBjaG9pY2UgaXMgcGVyc2lzdGVkIGFuZCBob25vcmVkIHZpYSBnZXRTYXZlZENvbGxhcHNlU3RhdGUuXG5cdFx0XHRpZiAoc2VjdGlvbi5pZCA9PT0gJ3Bpbm5lZCcgfHwgc2VjdGlvbi5pZCA9PT0gUVVJQ0tfQ0hBVFNfU0VDVElPTl9JRCkge1xuXHRcdFx0XHRkZWZhdWx0Q29sbGFwc2VkID0gT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLlByZXNlcnZlT3JDb2xsYXBzZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVsZW1lbnQ6IHNlY3Rpb24gYXMgU2Vzc2lvbkxpc3RJdGVtLFxuXHRcdFx0XHRjb2xsYXBzaWJsZTogdHJ1ZSxcblx0XHRcdFx0Y29sbGFwc2VkOiB0aGlzLmdldFNhdmVkQ29sbGFwc2VTdGF0ZShzZWN0aW9uLmlkKSA/PyBkZWZhdWx0Q29sbGFwc2VkLFxuXHRcdFx0XHRjaGlsZHJlbjogc2VjdGlvbkNoaWxkcmVuLFxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVuZGVyR3JvdXAgPSAoZ3JvdXBJdGVtOiBJU2Vzc2lvbkdyb3VwSXRlbSk6IElPYmplY3RUcmVlRWxlbWVudDxTZXNzaW9uTGlzdEl0ZW0+ID0+IHtcblx0XHRcdGNvbnN0IHNlY3Rpb25JZCA9IGBncm91cDoke2dyb3VwSXRlbS5ncm91cC5pZH1gO1xuXHRcdFx0Y29uc3QgZ3JvdXBDaGlsZHJlbiA9IGdyb3VwSXRlbS5zZXNzaW9ucy5sZW5ndGggPT09IDBcblx0XHRcdFx0PyBbe1xuXHRcdFx0XHRcdGVsZW1lbnQ6IHtcblx0XHRcdFx0XHRcdHBsYWNlaG9sZGVyOiB0cnVlIGFzIGNvbnN0LFxuXHRcdFx0XHRcdFx0c2VjdGlvbklkLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdub1Nlc3Npb25Jbkdyb3VwJywgXCJObyBzZXNzaW9uXCIpLFxuXHRcdFx0XHRcdFx0aG92ZXI6IGxvY2FsaXplKCdub1Nlc3Npb25Jbkdyb3VwSG92ZXInLCBcIlVzZSBBZGQgdG8gR3JvdXAgZnJvbSBhIHNlc3Npb24ncyBjb250ZXh0IG1lbnUsIG9yIGRyYWcgaXQgaW50byB0aGlzIGdyb3VwLlwiKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dXG5cdFx0XHRcdDogcmVuZGVyU2Vzc2lvbkNoaWxkcmVuKGdyb3VwSXRlbS5zZXNzaW9ucywgc2VjdGlvbklkLCBncm91cEl0ZW0uZ3JvdXAubmFtZSwgIXRoaXMuaGFzRmluZFBhdHRlcm4gJiYgdGhpcy53b3Jrc3BhY2VHcm91cENhcHBlZCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRlbGVtZW50OiBncm91cEl0ZW0sXG5cdFx0XHRcdGNvbGxhcHNpYmxlOiB0cnVlLFxuXHRcdFx0XHRjb2xsYXBzZWQ6IHRoaXMuZ2V0U2F2ZWRDb2xsYXBzZVN0YXRlKHNlY3Rpb25JZCkgPz8gT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLlByZXNlcnZlT3JFeHBhbmRlZCxcblx0XHRcdFx0Y2hpbGRyZW46IGdyb3VwQ2hpbGRyZW4sXG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHRpZiAodGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oQ2hhdEF1dG9tYXRpb25zRW5hYmxlZENvbnRleHQua2V5KSkge1xuXHRcdFx0Y2hpbGRyZW4ucHVzaChyZW5kZXJTZWN0aW9uKHsgaWQ6IEFVVE9NQVRJT05TX1NFQ1RJT05fSUQsIGxhYmVsOiBsb2NhbGl6ZSgnYXV0b21hdGlvbnMnLCBcIkF1dG9tYXRpb25zXCIpLCBzZXNzaW9uczogW10gfSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBpbm5lZFNlY3Rpb24gPSBzZWN0aW9ucy5maW5kKHMgPT4gcy5pZCA9PT0gJ3Bpbm5lZCcpO1xuXHRcdGlmIChwaW5uZWRTZWN0aW9uKSB7XG5cdFx0XHRjaGlsZHJlbi5wdXNoKHJlbmRlclNlY3Rpb24ocGlubmVkU2VjdGlvbikpO1xuXHRcdH1cblxuXHRcdC8vIFF1aWNrIGNoYXRzIHJlbmRlciBhcyBhIHNpbmdsZSBcIkNoYXRzXCIgZW50cnkgZGlyZWN0bHkgYmVsb3cgUGlubmVkIChhYm92ZVxuXHRcdC8vIHRoZSB3b3Jrc3BhY2UvZGF0ZSBncm91cHMpIGluIGJvdGggZ3JvdXBpbmcgbW9kZXMuXG5cdFx0Y29uc3QgcXVpY2tDaGF0c1NlY3Rpb24gPSBzZWN0aW9ucy5maW5kKHMgPT4gcy5pZCA9PT0gUVVJQ0tfQ0hBVFNfU0VDVElPTl9JRCk7XG5cdFx0aWYgKHF1aWNrQ2hhdHNTZWN0aW9uKSB7XG5cdFx0XHRjaGlsZHJlbi5wdXNoKHJlbmRlclNlY3Rpb24ocXVpY2tDaGF0c1NlY3Rpb24pKTtcblx0XHR9XG5cblx0XHRjb25zdCByZW5kZXJHcm91cEJ5SWQgPSAoaWQ6IHN0cmluZyk6IHZvaWQgPT4ge1xuXHRcdFx0Y29uc3QgZ3JvdXBJdGVtID0gZ3JvdXBJdGVtc0J5SWQuZ2V0KGlkLnNsaWNlKCdncm91cDonLmxlbmd0aCkpO1xuXHRcdFx0aWYgKGdyb3VwSXRlbSkge1xuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKHJlbmRlckdyb3VwKGdyb3VwSXRlbSkpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAoZ3JvdXBpbmcgPT09IFNlc3Npb25zR3JvdXBpbmcuRGF0ZSkge1xuXHRcdFx0Ly8gR3JvdXBzIGZvcm0gYSBjb250aWd1b3VzLCBmdWxseSB1c2VyLW9yZGVyZWQgYmxvY2sgcmlnaHQgYmVsb3cgdGhlXG5cdFx0XHQvLyBQaW5uZWQgc2VjdGlvbi4gVGhleSBubyBsb25nZXIgaW50ZXJsZWF2ZSB3aXRoIHRoZSBkYXRlIHNlY3Rpb25zIGJ5XG5cdFx0XHQvLyByZWNlbmN5IGFuZCBuZXZlciBtaXggaW50byBUb2RheS9ZZXN0ZXJkYXkvZXRjLiBQaW5uZWQgc3RheXMgYXQgdGhlXG5cdFx0XHQvLyB0b3AsIERvbmUgKGFyY2hpdmVkKSBzdGF5cyBhdCB0aGUgYm90dG9tLlxuXHRcdFx0Y29uc3QgcmVzb2x2ZWRHcm91cElkcyA9IHRoaXMuX3Nlc3Npb25TZWN0aW9uT3JkZXJTZXJ2aWNlLnJlc29sdmVPcmRlcihkZWZhdWx0R3JvdXBJZHMpO1xuXHRcdFx0dGhpcy5fdG9wTGV2ZWxPcmRlciA9IHJlc29sdmVkR3JvdXBJZHM7XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIHJlc29sdmVkR3JvdXBJZHMpIHtcblx0XHRcdFx0cmVuZGVyR3JvdXBCeUlkKGlkKTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiBzZWN0aW9ucykge1xuXHRcdFx0XHRpZiAoc2VjdGlvbi5pZCA9PT0gJ3Bpbm5lZCcgfHwgc2VjdGlvbi5pZCA9PT0gJ2FyY2hpdmVkJyB8fCBzZWN0aW9uLmlkID09PSBRVUlDS19DSEFUU19TRUNUSU9OX0lEKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2hpbGRyZW4ucHVzaChyZW5kZXJTZWN0aW9uKHNlY3Rpb24pKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFyY2hpdmVkID0gc2VjdGlvbnMuZmluZChzID0+IHMuaWQgPT09ICdhcmNoaXZlZCcpO1xuXHRcdFx0aWYgKGFyY2hpdmVkKSB7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2gocmVuZGVyU2VjdGlvbihhcmNoaXZlZCkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBXb3Jrc3BhY2UgZ3JvdXBpbmc6IGdyb3VwcyBhbmQgKHByaW1hcnkpIHdvcmtzcGFjZSBzZWN0aW9ucyBzaGFyZSBvbmVcblx0XHRcdC8vIGZyZWVseS1yZW9yZGVyYWJsZSwgdXNlci1tYW5hZ2VkIG9yZGVyIHJpZ2h0IGJlbG93IFBpbm5lZC4gR3JvdXBzXG5cdFx0XHQvLyBkZWZhdWx0IGFib3ZlIHdvcmtzcGFjZXM7IHdvcmtzcGFjZXMgZGVmYXVsdCB0byB0aGVpciBhbHBoYWJldGljYWxcblx0XHRcdC8vIG9yZGVyLiBQaW5uZWQgc3RheXMgZmlyc3QsIERvbmUgbGFzdCwgYW5kIGhpZGRlbiAoXCIrTiBtb3JlXCIpXG5cdFx0XHQvLyB3b3Jrc3BhY2VzIGFyZSBhcHBlbmRlZCBiZWxvdyB0aGUgb3JkZXJlZCBibG9jay5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZVNlY3Rpb25zID0gc2VjdGlvbnMuZmlsdGVyKHMgPT4gcy5pZC5zdGFydHNXaXRoKCd3b3Jrc3BhY2U6JykpO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbkJ5SWQgPSBuZXcgTWFwKHdvcmtzcGFjZVNlY3Rpb25zLm1hcChzID0+IFtzLmlkLCBzXSBhcyBjb25zdCkpO1xuXHRcdFx0Y29uc3QgcHJpbWFyeVdvcmtzcGFjZUlkcyA9IHdvcmtzcGFjZVNlY3Rpb25zXG5cdFx0XHRcdC5maWx0ZXIocyA9PiAhbW9yZUZvbGRlclNlY3Rpb25JZHMuaGFzKHMuaWQpKVxuXHRcdFx0XHQubWFwKHMgPT4gcy5pZCk7XG5cblx0XHRcdGNvbnN0IGRlZmF1bHRPcmRlciA9IFsuLi5kZWZhdWx0R3JvdXBJZHMsIC4uLnByaW1hcnlXb3Jrc3BhY2VJZHNdO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRJZHMgPSB0aGlzLl9zZXNzaW9uU2VjdGlvbk9yZGVyU2VydmljZS5yZXNvbHZlT3JkZXIoZGVmYXVsdE9yZGVyKTtcblx0XHRcdHRoaXMuX3RvcExldmVsT3JkZXIgPSByZXNvbHZlZElkcztcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgcmVzb2x2ZWRJZHMpIHtcblx0XHRcdFx0aWYgKGlkLnN0YXJ0c1dpdGgoJ2dyb3VwOicpKSB7XG5cdFx0XHRcdFx0cmVuZGVyR3JvdXBCeUlkKGlkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBzZWN0aW9uID0gc2VjdGlvbkJ5SWQuZ2V0KGlkKTtcblx0XHRcdFx0XHRpZiAoc2VjdGlvbikge1xuXHRcdFx0XHRcdFx0Y2hpbGRyZW4ucHVzaChyZW5kZXJTZWN0aW9uKHNlY3Rpb24pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9yZUZvbGRlclNlY3Rpb25zID0gd29ya3NwYWNlU2VjdGlvbnMuZmlsdGVyKHMgPT4gbW9yZUZvbGRlclNlY3Rpb25JZHMuaGFzKHMuaWQpKTtcblx0XHRcdGlmIChtb3JlRm9sZGVyU2VjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRpZiAodGhpcy5leHBhbmRlZE1vcmVGb2xkZXJzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIG1vcmVGb2xkZXJTZWN0aW9ucykge1xuXHRcdFx0XHRcdFx0Y2hpbGRyZW4ucHVzaChyZW5kZXJTZWN0aW9uKHNlY3Rpb24pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2hpbGRyZW4ucHVzaCh7XG5cdFx0XHRcdFx0XHRlbGVtZW50OiB7IHNob3dNb3JlOiB0cnVlIGFzIGNvbnN0LCBraW5kOiAnZm9sZGVycycgYXMgY29uc3QsIG1vZGU6ICdsZXNzJyBhcyBjb25zdCwgc2VjdGlvbklkOiBTSE9XX01PUkVfRk9MREVSU19MQUJFTCwgc2VjdGlvbkxhYmVsOiBTSE9XX01PUkVfRk9MREVSU19MQUJFTCwgcmVtYWluaW5nQ291bnQ6IDAgfSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjaGlsZHJlbi5wdXNoKHtcblx0XHRcdFx0XHRcdGVsZW1lbnQ6IHsgc2hvd01vcmU6IHRydWUgYXMgY29uc3QsIGtpbmQ6ICdmb2xkZXJzJyBhcyBjb25zdCwgbW9kZTogJ21vcmUnIGFzIGNvbnN0LCBzZWN0aW9uSWQ6IFNIT1dfTU9SRV9GT0xERVJTX0xBQkVMLCBzZWN0aW9uTGFiZWw6IFNIT1dfTU9SRV9GT0xERVJTX0xBQkVMLCByZW1haW5pbmdDb3VudDogbW9yZUZvbGRlclNlY3Rpb25zLmxlbmd0aCB9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoZSBhcmNoaXZlZCAoXCJEb25lXCIpIHNlY3Rpb24gaXMgYWx3YXlzIHRoZSB2ZXJ5IGxhc3QgZW50cnkuXG5cdFx0XHRjb25zdCBhcmNoaXZlZFNlY3Rpb24gPSBzZWN0aW9ucy5maW5kKHMgPT4gcy5pZCA9PT0gJ2FyY2hpdmVkJyk7XG5cdFx0XHRpZiAoYXJjaGl2ZWRTZWN0aW9uKSB7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2gocmVuZGVyU2VjdGlvbihhcmNoaXZlZFNlY3Rpb24pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgY2hpbGRyZW4pO1xuXHRcdHRoaXMuX29uRGlkVXBkYXRlLmZpcmUoKTtcblx0fVxuXG5cdGdldFZpc2libGVTZXNzaW9ucygpOiByZWFkb25seSBJU2Vzc2lvbltdIHtcblx0XHQvLyBEZXJpdmUgdGhlIHZpc2libGUgc2Vzc2lvbiBsaXN0IGZyb20gdGhlIHRyZWUgbW9kZWwgc28gdGhhdCBpbmRleC1iYXNlZFxuXHRcdC8vIG5hdmlnYXRpb24gbWF0Y2hlcyB3aGF0IHRoZSB1c2VyIGFjdHVhbGx5IHNlZXM6IHRoaXMgcmVzcGVjdHMgY29sbGFwc2VkXG5cdFx0Ly8gc2VjdGlvbnMsIGZpbmQtd2lkZ2V0IGZpbHRlcmluZywgYW5kIGV4Y2x1ZGVzIHNlY3Rpb24gLyBzaG93LW1vcmUgbm9kZXMuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBuZXcgU2V0PElTZXNzaW9uPih0aGlzLnNlc3Npb25zKTtcblx0XHRjb25zdCB2aXNpYmxlU2Vzc2lvbnM6IElTZXNzaW9uW10gPSBbXTtcblxuXHRcdGNvbnN0IGNvbGxlY3QgPSAobm9kZTogSVRyZWVOb2RlPFNlc3Npb25MaXN0SXRlbSB8IG51bGwsIEZ1enp5U2NvcmUgfCB1bmRlZmluZWQ+KTogdm9pZCA9PiB7XG5cdFx0XHRpZiAoIW5vZGUudmlzaWJsZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAobm9kZS5lbGVtZW50ICYmIHNlc3Npb25zLmhhcyhub2RlLmVsZW1lbnQgYXMgSVNlc3Npb24pKSB7XG5cdFx0XHRcdHZpc2libGVTZXNzaW9ucy5wdXNoKG5vZGUuZWxlbWVudCBhcyBJU2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAobm9kZS5jb2xsYXBzZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdGNvbGxlY3QoY2hpbGQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCByb290ID0gdGhpcy50cmVlLmdldE5vZGUoKTtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHJvb3QuY2hpbGRyZW4pIHtcblx0XHRcdGNvbGxlY3QoY2hpbGQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB2aXNpYmxlU2Vzc2lvbnM7XG5cdH1cblxuXHRyZXZlYWwoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRjb25zdCByZXNvdXJjZVN0ciA9IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLnNlc3Npb25zKSB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZVN0cikge1xuXHRcdFx0XHRpZiAodGhpcy50cmVlLmhhc0VsZW1lbnQoc2Vzc2lvbikpIHtcblx0XHRcdFx0XHRpZiAodGhpcy50cmVlLmdldFJlbGF0aXZlVG9wKHNlc3Npb24pID09PSBudWxsKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRyZWUucmV2ZWFsKHNlc3Npb24sIDAuNSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbc2Vzc2lvbl0pO1xuXHRcdFx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW3Nlc3Npb25dKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjbGVhckZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbXSk7XG5cdFx0dGhpcy50cmVlLnNldFNlbGVjdGlvbihbXSk7XG5cdH1cblxuXHRoYXNGb2N1c09yU2VsZWN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuZ2V0Rm9jdXMoKS5sZW5ndGggPiAwIHx8IHRoaXMudHJlZS5nZXRTZWxlY3Rpb24oKS5sZW5ndGggPiAwO1xuXHR9XG5cblx0c2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmlzaWJsZSA9PT0gdmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnZpc2libGUgPSB2aXNpYmxlO1xuXHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdH1cblx0fVxuXG5cdGxheW91dChoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuZG9tRm9jdXMoKTtcblxuXHRcdGlmICh0aGlzLnRyZWUuZ2V0Rm9jdXMoKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMudHJlZS5mb2N1c0ZpcnN0KCk7XG5cdFx0fVxuXHR9XG5cblx0b3BlbkZpbmQoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLm9wZW5GaW5kKCk7XG5cdH1cblxuXHRjbG9zZUZpbmQoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLmNsb3NlRmluZCgpO1xuXHR9XG5cblx0Ly8gQ29udGV4dCBtZW51XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgYSBzZXNzaW9uIG1heSBwYXJ0aWNpcGF0ZSBpbiBtYW51YWwgcmVvcmRlcmluZy4gQXJjaGl2ZWQgKERvbmUpXG5cdCAqIHNlc3Npb25zIGtlZXAgdGhlaXIgZml4ZWQgc2VjdGlvbi5cblx0ICovXG5cdHByaXZhdGUgaXNSZW9yZGVyYWJsZShzZXNzaW9uOiBJU2Vzc2lvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhc2Vzc2lvbi5pc0FyY2hpdmVkLmdldCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGRyYWdnZWQgc2Vzc2lvbnMgY2FuIGJlIHJlb3JkZXJlZCByZWxhdGl2ZSB0byB0aGUgdGFyZ2V0LlxuXHQgKiBSZW9yZGVyaW5nIHN0YXlzIHdpdGhpbiB0aGUgc2FtZSBzY29wZTogZHJhZ2dlZCBzZXNzaW9ucyBtdXN0IHNoYXJlIHRoZVxuXHQgKiB0YXJnZXQncyBncm91cCBtZW1iZXJzaGlwLCBhbmQgKHdoZW4gZ3JvdXBpbmcgYnkgd29ya3NwYWNlKSBpdHMgd29ya3NwYWNlLlxuXHQgKi9cblx0cHJpdmF0ZSBjYW5SZW9yZGVyT250byhkcmFnZ2VkOiBJU2Vzc2lvbltdLCB0YXJnZXQ6IElTZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdGFyZ2V0UGlubmVkID0gdGhpcy5pc1Nlc3Npb25QaW5uZWQodGFyZ2V0KTtcblx0XHRpZiAoZHJhZ2dlZC5zb21lKHMgPT4gdGhpcy5pc1Nlc3Npb25QaW5uZWQocykgIT09IHRhcmdldFBpbm5lZCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRhcmdldFBpbm5lZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0R3JvdXAgPSB0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbih0YXJnZXQuc2Vzc2lvbklkKTtcblx0XHRpZiAoZHJhZ2dlZC5zb21lKHMgPT4gdGhpcy5fc2Vzc2lvbkdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXBPZlNlc3Npb24ocy5zZXNzaW9uSWQpICE9PSB0YXJnZXRHcm91cCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRhcmdldEdyb3VwID09PSB1bmRlZmluZWQgJiYgdGhpcy5vcHRpb25zLmdyb3VwaW5nKCkgPT09IFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlKSB7XG5cdFx0XHRjb25zdCB0YXJnZXRMYWJlbCA9IHNlc3Npb25Xb3Jrc3BhY2VMYWJlbCh0YXJnZXQpO1xuXHRcdFx0cmV0dXJuIGRyYWdnZWQuZXZlcnkocyA9PiBzZXNzaW9uV29ya3NwYWNlTGFiZWwocykgPT09IHRhcmdldExhYmVsKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogUmVvcmRlciB0aGUgZHJhZ2dlZCBzZXNzaW9ucyBzbyB0aGV5IGxhbmQgYXMgYSBjb250aWd1b3VzIGJsb2NrIGJlZm9yZSBvclxuXHQgKiBhZnRlciB0aGUgdGFyZ2V0IHNlc3Npb24sIHBlcnNpc3RpbmcgYSBzeW50aGV0aWMgc29ydCBrZXkgKHRoZSBtaWRwb2ludCBvZlxuXHQgKiB0aGUgc3Vycm91bmRpbmcgc2Vzc2lvbnMnIGtleXMpLiBXaGVuIHRoZSBkcmFnZ2VkIHNlc3Npb25zJyBuYXR1cmFsXG5cdCAqIHRpbWVzdGFtcHMgYWxyZWFkeSBzb3J0IHRoZW0gaW50byB0aGUgZHJvcHBlZCBzbG90LCBhbnkgc3RvcmVkIG92ZXJyaWRlIGlzXG5cdCAqIGRyb3BwZWQgaW5zdGVhZCBzbyB0aGUgbGlzdCBmYWxscyBiYWNrIHRvIG5hdHVyYWwgb3JkZXJpbmcuXG5cdCAqL1xuXHRwcml2YXRlIHJlb3JkZXJTZXNzaW9ucyhkcmFnZ2VkOiBJU2Vzc2lvbltdLCB0YXJnZXQ6IElTZXNzaW9uLCBwb3NpdGlvbjogJ2JlZm9yZScgfCAnYWZ0ZXInKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZSA9IHNvcnRpbmdUb01vZGUodGhpcy5vcHRpb25zLnNvcnRpbmcoKSk7XG5cdFx0Y29uc3QgZ3JvdXBpbmcgPSB0aGlzLm9wdGlvbnMuZ3JvdXBpbmcoKTtcblx0XHRjb25zdCBnZXRLZXkgPSAoczogSVNlc3Npb24pID0+IHRoaXMuX3Nlc3Npb25zTGlzdE1vZGVsU2VydmljZS5nZXRTb3J0S2V5KHMsIG1vZGUpO1xuXG5cdFx0Ly8gRGVyaXZlIG5laWdoYm91cnMgZnJvbSB0aGUgYWN0dWFsIHZpc2libGUgZGlzcGxheSBvcmRlciAod2hpY2ggYWxyZWFkeVxuXHRcdC8vIHJlc3BlY3RzIGZpbHRlcmluZyBhbmQgZ3JvdXBpbmcpIHNvIHRoZSBkcm9wIHNsb3QgbWF0Y2hlcyB3aGF0IHRoZSB1c2VyXG5cdFx0Ly8gc2Vlcy5cblx0XHRjb25zdCB0YXJnZXRQaW5uZWQgPSB0aGlzLmlzU2Vzc2lvblBpbm5lZCh0YXJnZXQpO1xuXHRcdGxldCBzY29wZSA9IHRoaXMuZ2V0VmlzaWJsZVNlc3Npb25zKCkuZmlsdGVyKHMgPT4gdGhpcy5pc1Jlb3JkZXJhYmxlKHMpKTtcblx0XHRzY29wZSA9IHNjb3BlLmZpbHRlcihzID0+IHRoaXMuaXNTZXNzaW9uUGlubmVkKHMpID09PSB0YXJnZXRQaW5uZWQpO1xuXHRcdGlmICghdGFyZ2V0UGlubmVkKSB7XG5cdFx0XHRjb25zdCB0YXJnZXRHcm91cCA9IHRoaXMuX3Nlc3Npb25Hcm91cHNTZXJ2aWNlLmdldEdyb3VwT2ZTZXNzaW9uKHRhcmdldC5zZXNzaW9uSWQpO1xuXHRcdFx0c2NvcGUgPSBzY29wZS5maWx0ZXIocyA9PiB0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbihzLnNlc3Npb25JZCkgPT09IHRhcmdldEdyb3VwKTtcblx0XHRcdGlmICh0YXJnZXRHcm91cCA9PT0gdW5kZWZpbmVkICYmIGdyb3VwaW5nID09PSBTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZSkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRMYWJlbCA9IHNlc3Npb25Xb3Jrc3BhY2VMYWJlbCh0YXJnZXQpO1xuXHRcdFx0XHRzY29wZSA9IHNjb3BlLmZpbHRlcihzID0+IHNlc3Npb25Xb3Jrc3BhY2VMYWJlbChzKSA9PT0gdGFyZ2V0TGFiZWwpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGRyYWdnZWRJZHMgPSBuZXcgU2V0KGRyYWdnZWQubWFwKHMgPT4gcy5zZXNzaW9uSWQpKTtcblx0XHRjb25zdCBkcmFnZ2VkT3JkZXJlZCA9IHNjb3BlLmZpbHRlcihzID0+IGRyYWdnZWRJZHMuaGFzKHMuc2Vzc2lvbklkKSk7XG5cdFx0aWYgKGRyYWdnZWRPcmRlcmVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZW1haW5pbmcgPSBzY29wZS5maWx0ZXIocyA9PiAhZHJhZ2dlZElkcy5oYXMocy5zZXNzaW9uSWQpKTtcblxuXHRcdGNvbnN0IHRhcmdldEluZGV4ID0gcmVtYWluaW5nLmZpbmRJbmRleChzID0+IHMuc2Vzc2lvbklkID09PSB0YXJnZXQuc2Vzc2lvbklkKTtcblx0XHRpZiAodGFyZ2V0SW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zZXJ0SW5kZXggPSBwb3NpdGlvbiA9PT0gJ2JlZm9yZScgPyB0YXJnZXRJbmRleCA6IHRhcmdldEluZGV4ICsgMTtcblx0XHRjb25zdCBhYm92ZSA9IHJlbWFpbmluZ1tpbnNlcnRJbmRleCAtIDFdO1xuXHRcdGNvbnN0IGJlbG93ID0gcmVtYWluaW5nW2luc2VydEluZGV4XTtcblxuXHRcdGNvbnN0IHsgc2V0LCBjbGVhciB9ID0gY29tcHV0ZVJlb3JkZXJTb3J0Q2hhbmdlcyh7XG5cdFx0XHRkcmFnZ2VkSWRzOiBkcmFnZ2VkT3JkZXJlZC5tYXAocyA9PiBzLnNlc3Npb25JZCksXG5cdFx0XHRuYXR1cmFsS2V5czogZHJhZ2dlZE9yZGVyZWQubWFwKHMgPT4gdGhpcy5fc2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLmdldE5hdHVyYWxTb3J0S2V5KHMsIG1vZGUpKSxcblx0XHRcdGFib3ZlS2V5OiBhYm92ZSA/IGdldEtleShhYm92ZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRiZWxvd0tleTogYmVsb3cgPyBnZXRLZXkoYmVsb3cpIDogdW5kZWZpbmVkLFxuXHRcdFx0bm93OiBEYXRlLm5vdygpLFxuXHRcdFx0ZmFsbGJhY2tTdGVwOiBTT1JUX0ZBTExCQUNLX1NURVBfTVMsXG5cdFx0fSk7XG5cdFx0dGhpcy5fc2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLmFwcGx5U29ydENoYW5nZXMobW9kZSwgc2V0LCBjbGVhcik7XG5cdH1cblxuXHQvLyAtLSBHcm91cHMgLS1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IGdyb3VwIGNvbnRhaW5pbmcgdGhlIGdpdmVuIHNlc3Npb25zIGFuZCBzdGFydCByZW5hbWluZyBpdC5cblx0ICogQXJjaGl2ZWQgKERvbmUpIHNlc3Npb25zIGFyZSBpZ25vcmVkLlxuXHQgKi9cblx0Y3JlYXRlR3JvdXBGcm9tU2Vzc2lvbnMoc2Vzc2lvbnM6IElTZXNzaW9uW10pOiB2b2lkIHtcblx0XHRjb25zdCBncm91cFNlc3Npb25zID0gc2Vzc2lvbnMuZmlsdGVyKHNlc3Npb24gPT4gIXNlc3Npb24uaXNBcmNoaXZlZC5nZXQoKSk7XG5cdFx0aWYgKGdyb3VwU2Vzc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY3JlYXRlR3JvdXAoZ3JvdXBTZXNzaW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUdyb3VwKGdyb3VwU2Vzc2lvbnM6IElTZXNzaW9uW10pOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UudW5waW5TZXNzaW9ucyhncm91cFNlc3Npb25zKTtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuX3Nlc3Npb25Hcm91cHNTZXJ2aWNlLmNyZWF0ZUdyb3VwKGxvY2FsaXplKCduZXdHcm91cE5hbWUnLCBcIk5ldyBHcm91cFwiKSwgZ3JvdXBTZXNzaW9ucy5tYXAocyA9PiBzLnNlc3Npb25JZCkpO1xuXHRcdHRoaXMuX2VkaXRpbmdHcm91cElkID0gZ3JvdXAuaWQ7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0XHR0aGlzLnJldmVhbEdyb3VwKGdyb3VwLmlkKTtcblx0fVxuXG5cdC8qKiBTY3JvbGwgdGhlIGdyb3VwJ3MgaGVhZGVyIGludG8gdmlldyBzbyBpdHMgaW5saW5lIG5hbWUgZWRpdG9yIGlzIHZpc2libGUuICovXG5cdHByaXZhdGUgcmV2ZWFsR3JvdXAoZ3JvdXBJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgcm9vdCA9IHRoaXMudHJlZS5nZXROb2RlKCk7XG5cdFx0Zm9yIChjb25zdCBub2RlIG9mIHJvb3QuY2hpbGRyZW4pIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0XHRpZiAoZWxlbWVudCAmJiBpc1Nlc3Npb25Hcm91cEl0ZW0oZWxlbWVudCkgJiYgZWxlbWVudC5ncm91cC5pZCA9PT0gZ3JvdXBJZCkge1xuXHRcdFx0XHRpZiAodGhpcy50cmVlLmhhc0VsZW1lbnQoZWxlbWVudCkgJiYgdGhpcy50cmVlLmdldFJlbGF0aXZlVG9wKGVsZW1lbnQpID09PSBudWxsKSB7XG5cdFx0XHRcdFx0dGhpcy50cmVlLnJldmVhbChlbGVtZW50LCAwLjUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKiogQmVnaW4gaW5saW5lIHJlbmFtaW5nIG9mIHRoZSBncm91cCdzIGhlYWRlci4gKi9cblx0YmVnaW5SZW5hbWVHcm91cChncm91cElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Nlc3Npb25Hcm91cHNTZXJ2aWNlLmdldEdyb3VwKGdyb3VwSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2VkaXRpbmdHcm91cElkID0gZ3JvdXBJZDtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0YWRkU2Vzc2lvbnNUb0dyb3VwKHNlc3Npb25zOiBJU2Vzc2lvbltdLCBncm91cElkOiBzdHJpbmcsIHRhcmdldD86IElTZXNzaW9uLCBwb3NpdGlvbj86ICdiZWZvcmUnIHwgJ2FmdGVyJyk6IHZvaWQge1xuXHRcdGNvbnN0IGdyb3VwU2Vzc2lvbnMgPSBzZXNzaW9ucy5maWx0ZXIoc2Vzc2lvbiA9PiAhc2Vzc2lvbi5pc0FyY2hpdmVkLmdldCgpKTtcblx0XHR0aGlzLl9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UudW5waW5TZXNzaW9ucyhncm91cFNlc3Npb25zKTtcblx0XHR0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5hZGRUb0dyb3VwKGdyb3VwU2Vzc2lvbnMubWFwKHMgPT4gcy5zZXNzaW9uSWQpLCBncm91cElkKTtcblx0XHRpZiAodGFyZ2V0ICYmIHBvc2l0aW9uKSB7XG5cdFx0XHR0aGlzLnJlb3JkZXJTZXNzaW9ucyhncm91cFNlc3Npb25zLCB0YXJnZXQsIHBvc2l0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNvbW1pdEdyb3VwRWRpdChncm91cDogSVNlc3Npb25Hcm91cCwgbmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdGluZ0dyb3VwSWQgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdHJpbW1lZCA9IG5hbWUudHJpbSgpO1xuXHRcdGlmICh0cmltbWVkKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5yZW5hbWVHcm91cChncm91cC5pZCwgdHJpbW1lZCk7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGNhbmNlbEdyb3VwRWRpdChfZ3JvdXA6IElTZXNzaW9uR3JvdXApOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0aW5nR3JvdXBJZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlb3JkZXIgYSB0b3AtbGV2ZWwgaGVhZGVyIChncm91cCBvciB3b3Jrc3BhY2Ugc2VjdGlvbikgc28gaXQgbGFuZHNcblx0ICogYmVmb3JlL2FmdGVyIHRoZSB0YXJnZXQgaGVhZGVyLiBUaGUgbmV3IG9yZGVyIGlzIHBlcnNpc3RlZCB0byB0aGVcblx0ICogc2VjdGlvbi1vcmRlciBzZXJ2aWNlLiBXaGVuIHRoZSBkcmFnZ2VkIGhlYWRlciBpcyBhIHdvcmtzcGFjZSBpdCBpcyBhbHNvXG5cdCAqIHByb21vdGVkIHNvIGl0IHN0YXlzIHZpc2libGUgKGVzY2FwZXMgdGhlIFwiK04gbW9yZSB3b3Jrc3BhY2VzXCIgY2FwcGluZykuXG5cdCAqL1xuXHRwcml2YXRlIHJlb3JkZXJTZWN0aW9uKGRyYWdnZWRJZDogc3RyaW5nLCB0YXJnZXRJZDogc3RyaW5nLCBwb3NpdGlvbjogJ2JlZm9yZScgfCAnYWZ0ZXInLCBpc1dvcmtzcGFjZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25TZWN0aW9uT3JkZXJTZXJ2aWNlLnJlb3JkZXIodGhpcy5fdG9wTGV2ZWxPcmRlciwgZHJhZ2dlZElkLCB0YXJnZXRJZCwgcG9zaXRpb24sIGlzV29ya3NwYWNlID8gZHJhZ2dlZElkIDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHcm91cHMgaW4gdGhlaXIgY3VycmVudCB0b3AtdG8tYm90dG9tIGRpc3BsYXkgb3JkZXIuIEdyb3VwcyBhcmUgZnVsbHlcblx0ICogdXNlci1tYW5hZ2VkIChzZWUge0BsaW5rIElTZXNzaW9uU2VjdGlvbk9yZGVyU2VydmljZX0pOyB0aGUgb3JkZXIgZGVmYXVsdHNcblx0ICogdG8gbmV3ZXN0LWZpcnN0IGFuZCBpcyBzaGFyZWQgd2l0aCB0aGUgbGlzdC4gVXNlZCB0byBrZWVwIHRoZSBcIkFkZCB0b1xuXHQgKiBHcm91cFwiIC8gXCJNb3ZlIHRvIEdyb3VwXCIgbWVudSBjb25zaXN0ZW50IHdpdGggdGhlIHJlbmRlcmVkIG9yZGVyLlxuXHQgKi9cblx0Z2V0R3JvdXBzSW5EaXNwbGF5T3JkZXIoKTogSVNlc3Npb25Hcm91cFtdIHtcblx0XHRjb25zdCBncm91cHMgPSB0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5nZXRHcm91cHMoKTtcblx0XHRjb25zdCBieUlkID0gbmV3IE1hcDxzdHJpbmcsIElTZXNzaW9uR3JvdXA+KGdyb3Vwcy5tYXAoZyA9PiBbYGdyb3VwOiR7Zy5pZH1gLCBnXSkpO1xuXHRcdGNvbnN0IGRlZmF1bHRJZHMgPSBbLi4uZ3JvdXBzXVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGIuY3JlYXRlZEF0IC0gYS5jcmVhdGVkQXQpXG5cdFx0XHQubWFwKGcgPT4gYGdyb3VwOiR7Zy5pZH1gKTtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvblNlY3Rpb25PcmRlclNlcnZpY2UucmVzb2x2ZU9yZGVyKGRlZmF1bHRJZHMpXG5cdFx0XHQubWFwKGlkID0+IGJ5SWQuZ2V0KGlkKSlcblx0XHRcdC5maWx0ZXIoKGcpOiBnIGlzIElTZXNzaW9uR3JvdXAgPT4gISFnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgc2V0IG9mIHRvcC1sZXZlbCByZW9yZGVyIGlkZW50aXRpZXMgdGhhdCBjdXJyZW50bHkgZXhpc3QgKGV2ZXJ5IGdyb3VwLFxuXHQgKiBwbHVzIGV2ZXJ5IHdvcmtzcGFjZSBsYWJlbCBwcmVzZW50IGFjcm9zcyBhbGwgc2Vzc2lvbnMsIHJlZ2FyZGxlc3Mgb2Zcblx0ICogZ3JvdXBpbmcgbW9kZSBvciBjYXBwaW5nKS4gVXNlZCB0byBnYXJiYWdlLWNvbGxlY3Qgc3RhbGUgbWFudWFsIG9yZGVyIGFuZFxuXHQgKiBwcm9tb3Rpb24gZW50cmllcy4gUmVhZHMgc2Vzc2lvbnMgZnJlc2ggZnJvbSB0aGUgbWFuYWdlbWVudCBzZXJ2aWNlIHNvIGl0XG5cdCAqIHJlZmxlY3RzIHRoZSBsYXRlc3QgbG9hZGVkIHN0YXRlIGV2ZW4gd2hlbiB0aGUgbGlzdCBpcyBub3QgdmlzaWJsZS5cblx0ICovXG5cdHByaXZhdGUgbGl2ZVNlY3Rpb25PcmRlcklkcygpOiBTZXQ8c3RyaW5nPiB7XG5cdFx0Y29uc3QgaWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5nZXRHcm91cHMoKSkge1xuXHRcdFx0aWRzLmFkZChgZ3JvdXA6JHtncm91cC5pZH1gKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbnMoKSkge1xuXHRcdFx0aWRzLmFkZChgd29ya3NwYWNlOiR7c2Vzc2lvbldvcmtzcGFjZUxhYmVsKHNlc3Npb24pfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gaWRzO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXREcm9wVGFyZ2V0SGVhZGVyKGhlYWRlcjogSVNlc3Npb25Ecm9wVGFyZ2V0SGVhZGVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2Ryb3BUYXJnZXRIZWFkZXI7XG5cdFx0aWYgKGN1cnJlbnQ/LmtpbmQgPT09IGhlYWRlcj8ua2luZCAmJiBjdXJyZW50Py5pZCA9PT0gaGVhZGVyPy5pZCkge1xuXHRcdFx0dGhpcy50b2dnbGVEcm9wVGFyZ2V0SGVhZGVyKGhlYWRlciwgaGVhZGVyICE9PSB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnRvZ2dsZURyb3BUYXJnZXRIZWFkZXIoY3VycmVudCwgZmFsc2UpO1xuXHRcdHRoaXMuX2Ryb3BUYXJnZXRIZWFkZXIgPSBoZWFkZXI7XG5cdFx0dGhpcy50b2dnbGVEcm9wVGFyZ2V0SGVhZGVyKGhlYWRlciwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZURyb3BUYXJnZXRIZWFkZXIoaGVhZGVyOiBJU2Vzc2lvbkRyb3BUYXJnZXRIZWFkZXIgfCB1bmRlZmluZWQsIGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghaGVhZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChoZWFkZXIua2luZCA9PT0gJ2dyb3VwJykge1xuXHRcdFx0dGhpcy5fZ3JvdXBSZW5kZXJlci5zZXREcm9wVGFyZ2V0KGhlYWRlci5pZCwgYWN0aXZlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2VjdGlvblJlbmRlcmVyLnNldERyb3BUYXJnZXQoaGVhZGVyLmlkLCBhY3RpdmUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0TXVsdGlTZWxlY3RlZFNlc3Npb25zKHNlc3Npb246IElTZXNzaW9uKTogSVNlc3Npb25bXSB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy50cmVlLmdldFNlbGVjdGlvbigpLmZpbHRlcigocyk6IHMgaXMgSVNlc3Npb24gPT4gISFzICYmIGlzU2Vzc2lvbkl0ZW0ocykpO1xuXHRcdHJldHVybiBzZWxlY3Rpb24uaW5jbHVkZXMoc2Vzc2lvbikgPyBbc2Vzc2lvbiwgLi4uc2VsZWN0aW9uLmZpbHRlcihzID0+IHMgIT09IHNlc3Npb24pXSA6IFtzZXNzaW9uXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlVG9vbGJhckFjdGlvbihhY3Rpb246IElBY3Rpb24sIHNlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSB0aGlzLmdldE11bHRpU2VsZWN0ZWRTZXNzaW9ucyhzZXNzaW9uKTtcblx0XHRpZiAoIXNob3VsZEFuaW1hdGVBcmNoaXZlQWN0aW9uKGFjdGlvbi5pZCwgc2Vzc2lvbnMubGVuZ3RoLCB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZXMgPSBzZXNzaW9ucy5tYXAoc2Vzc2lvbiA9PiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGlmIChzZXNzaW9uUmVzb3VyY2VzLnNvbWUocmVzb3VyY2UgPT4gdGhpcy5fYXJjaGl2ZUFjdGlvbnNJblByb2dyZXNzLmhhcyhyZXNvdXJjZSkpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBvdmVybGF5SG9zdCA9IHRoaXMubGF5b3V0U2VydmljZS5nZXRDb250YWluZXIoRE9NLmdldFdpbmRvdyh0aGlzLmxpc3RDb250YWluZXIpKTtcblx0XHRjb25zdCBhbmltYXRpb24gPSB0aGlzLl9zZXNzaW9uUmVuZGVyZXIuc3RhcnRBcmNoaXZlQW5pbWF0aW9uKHNlc3Npb24sIG92ZXJsYXlIb3N0KTtcblx0XHRpZiAoIWFuaW1hdGlvbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2Ygc2Vzc2lvblJlc291cmNlcykge1xuXHRcdFx0dGhpcy5fYXJjaGl2ZUFjdGlvbnNJblByb2dyZXNzLmFkZChyZXNvdXJjZSk7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBhbmltYXRpb24uZmluaXNoZWQ7XG5cdFx0XHRhd2FpdCBhY3Rpb24ucnVuKHNlc3Npb25zKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uUmVuZGVyZXIuY2xlYXJBcmNoaXZlQW5pbWF0aW9uKHNlc3Npb24sIGFuaW1hdGlvbik7XG5cdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHNlc3Npb25SZXNvdXJjZXMpIHtcblx0XHRcdFx0dGhpcy5fYXJjaGl2ZUFjdGlvbnNJblByb2dyZXNzLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbnRleHRNZW51KGU6IElUcmVlQ29udGV4dE1lbnVFdmVudDxTZXNzaW9uTGlzdEl0ZW0gfCBudWxsPik6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBlLmVsZW1lbnQ7XG5cdFx0aWYgKCFlbGVtZW50IHx8IGlzU2Vzc2lvblNlY3Rpb24oZWxlbWVudCkgfHwgaXNTZXNzaW9uU2hvd01vcmUoZWxlbWVudCkgfHwgaXNTZXNzaW9uUGxhY2Vob2xkZXIoZWxlbWVudCkpIHtcblx0XHRcdHRoaXMuc2hvd0NyZWF0ZUdyb3VwQ29udGV4dE1lbnUoZS5hbmNob3IpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpc1Nlc3Npb25Hcm91cEl0ZW0oZWxlbWVudCkpIHtcblx0XHRcdHRoaXMuc2hvd0dyb3VwQ29udGV4dE1lbnUoZWxlbWVudCwgZS5hbmNob3IpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGVkU2Vzc2lvbnMgPSB0aGlzLmdldE11bHRpU2VsZWN0ZWRTZXNzaW9ucyhlbGVtZW50KTtcblxuXHRcdGNvbnN0IGluR3JvdXAgPSB0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbihlbGVtZW50LnNlc3Npb25JZCkgIT09IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb250ZXh0T3ZlcmxheTogW3N0cmluZywgYm9vbGVhbiB8IHN0cmluZ11bXSA9IFtcblx0XHRcdFtJc1Nlc3Npb25QaW5uZWRDb250ZXh0LmtleSwgdGhpcy5pc1Nlc3Npb25QaW5uZWQoZWxlbWVudCldLFxuXHRcdFx0W1Nlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5rZXksIGVsZW1lbnQuaXNBcmNoaXZlZC5nZXQoKV0sXG5cdFx0XHRbU2Vzc2lvbklzUmVhZENvbnRleHQua2V5LCBlbGVtZW50LmlzUmVhZC5nZXQoKV0sXG5cdFx0XHRbU2Vzc2lvbkl0ZW1IYXNCcmFuY2hOYW1lQ29udGV4dC5rZXksICEhZWxlbWVudC53b3Jrc3BhY2UuZ2V0KCk/LmZvbGRlcnNbMF0/LmdpdFJlcG9zaXRvcnk/LmJyYW5jaE5hbWU/LnRyaW0oKV0sXG5cdFx0XHRbU2Vzc2lvbkl0ZW1Jbkdyb3VwQ29udGV4dC5rZXksIGluR3JvdXBdLFxuXHRcdFx0W1Nlc3Npb25UeXBlQ29udGV4dC5rZXksIGVsZW1lbnQuc2Vzc2lvblR5cGVdLFxuXHRcdFx0W1Nlc3Npb25Qcm92aWRlcklkQ29udGV4dC5rZXksIGVsZW1lbnQucHJvdmlkZXJJZF0sXG5cdFx0XHRbU2Vzc2lvblN1cHBvcnRzUmVuYW1lQ29udGV4dC5rZXksIGVsZW1lbnQuY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzUmVuYW1lID8/IGZhbHNlXSxcblx0XHRcdFtTZXNzaW9uU3VwcG9ydHNEZWxldGVDb250ZXh0LmtleSwgZWxlbWVudC5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNEZWxldGUgPz8gZmFsc2VdLFxuXHRcdFx0W1Nlc3Npb25IYXNQdWxsUmVxdWVzdENvbnRleHQua2V5LCAhIWVsZW1lbnQud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy5naXRSZXBvc2l0b3J5Py5naXRIdWJJbmZvLmdldCgpPy5wdWxsUmVxdWVzdF0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoU2Vzc2lvbkl0ZW1Db250ZXh0TWVudUlkLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoY29udGV4dE92ZXJsYXkpKTtcblxuXHRcdC8vIEV4dGVuc2lvbiBjb250cmlidXRpb25zIG9uIHRoaXMgbWVudSBuZWVkIGEgbWFyc2hhbGxlZCBBZ2VudFNlc3Npb25Db250ZXh0IGFyZzsgYnVpbHQtaW4gYWN0aW9ucyB0YWtlIElTZXNzaW9uW10uXG5cdFx0Y29uc3QgbWFyc2hhbGxlZEFyZyA9IHtcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5BZ2VudFNlc3Npb25Db250ZXh0LFxuXHRcdFx0c2Vzc2lvbjogeyByZXNvdXJjZTogZWxlbWVudC5yZXNvdXJjZSB9LFxuXHRcdFx0c2Vzc2lvbnM6IHNlbGVjdGVkU2Vzc2lvbnMubWFwKHMgPT4gKHsgcmVzb3VyY2U6IHMucmVzb3VyY2UgfSkpLFxuXHRcdH07XG5cdFx0Y29uc3Qgd3JhcEZvckV4dGVuc2lvbnMgPSAoYWN0aW9uOiBJQWN0aW9uKTogSUFjdGlvbiA9PiB7XG5cdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikgfHwgIWFjdGlvbi5pdGVtLnNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm4gYWN0aW9uO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgd3JhcHBlZCA9IG5ldyBBY3Rpb24oYWN0aW9uLmlkLCBhY3Rpb24ubGFiZWwsIGFjdGlvbi5jbGFzcywgYWN0aW9uLmVuYWJsZWQsICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoYWN0aW9uLmlkLCBtYXJzaGFsbGVkQXJnKSk7XG5cdFx0XHR3cmFwcGVkLnRvb2x0aXAgPSBhY3Rpb24udG9vbHRpcDtcblx0XHRcdHdyYXBwZWQuY2hlY2tlZCA9IGFjdGlvbi5jaGVja2VkO1xuXHRcdFx0cmV0dXJuIHdyYXBwZWQ7XG5cdFx0fTtcblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGJhc2UgPSBTZXBhcmF0b3Iuam9pbiguLi5tZW51LmdldEFjdGlvbnMoeyBhcmc6IHNlbGVjdGVkU2Vzc2lvbnMsIHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pLm1hcCgoWywgYWN0aW9uc10pID0+IGFjdGlvbnMubWFwKHdyYXBGb3JFeHRlbnNpb25zKSkpO1xuXHRcdFx0XHRjb25zdCBncm91cEFjdGlvbnMgPSB0aGlzLmdldEdyb3VwU2Vzc2lvbkFjdGlvbnMoc2VsZWN0ZWRTZXNzaW9ucyk7XG5cdFx0XHRcdHJldHVybiBncm91cEFjdGlvbnMubGVuZ3RoID4gMCA/IFsuLi5iYXNlLCBuZXcgU2VwYXJhdG9yKCksIC4uLmdyb3VwQWN0aW9uc10gOiBiYXNlO1xuXHRcdFx0fSxcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRnZXRLZXlCaW5kaW5nOiAoYWN0aW9uKSA9PiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKSA/PyB1bmRlZmluZWQsXG5cdFx0fSk7XG5cblx0XHRtZW51LmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZCB0aGUgZ3JvdXAtcmVsYXRlZCBjb250ZXh0IG1lbnUgYWN0aW9ucyBmb3IgdGhlIGdpdmVuIHNlc3Npb24ocyk6XG5cdCAqIFwiQ3JlYXRlIEdyb3VwXCIsIGFuIFwiQWRkIHRvIEdyb3VwXCIvXCJNb3ZlIHRvIEdyb3VwXCIgc3VibWVudSBsaXN0aW5nIHRoZVxuXHQgKiBncm91cHMgaW4gZGlzcGxheSBvcmRlciwgYW5kIFwiUmVtb3ZlIGZyb20gR3JvdXBcIiB3aGVuIGFwcGxpY2FibGUuXG5cdCAqL1xuXHRwcml2YXRlIGdldEdyb3VwU2Vzc2lvbkFjdGlvbnMoc2VsZWN0ZWQ6IElTZXNzaW9uW10pOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGlmIChzZWxlY3RlZC5zb21lKHNlc3Npb24gPT4gc2Vzc2lvbi5pc0FyY2hpdmVkLmdldCgpKSkge1xuXHRcdFx0cmV0dXJuIGFjdGlvbnM7XG5cdFx0fVxuXG5cdFx0YWN0aW9ucy5wdXNoKHRoaXMuZ2V0Q3JlYXRlR3JvdXBBY3Rpb24oc2VsZWN0ZWQpKTtcblxuXHRcdGNvbnN0IGN1cnJlbnRHcm91cElkcyA9IG5ldyBTZXQoc2VsZWN0ZWQubWFwKHMgPT4gdGhpcy5fc2Vzc2lvbkdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXBPZlNlc3Npb24ocy5zZXNzaW9uSWQpKSk7XG5cdFx0Y29uc3QgY3VycmVudEdyb3VwSWQgPSBjdXJyZW50R3JvdXBJZHMuc2l6ZSA9PT0gMSA/IFsuLi5jdXJyZW50R3JvdXBJZHNdWzBdIDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgdGFyZ2V0R3JvdXBzID0gdGhpcy5nZXRHcm91cHNJbkRpc3BsYXlPcmRlcigpLmZpbHRlcihnID0+IGcuaWQgIT09IGN1cnJlbnRHcm91cElkKTtcblx0XHRpZiAodGFyZ2V0R3JvdXBzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHN1YkFjdGlvbnMgPSB0YXJnZXRHcm91cHMubWFwKGcgPT4gbmV3IEFjdGlvbihgc2Vzc2lvbnMuYWRkVG9Hcm91cC4ke2cuaWR9YCwgZy5uYW1lLCB1bmRlZmluZWQsIHRydWUsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5hZGRTZXNzaW9uc1RvR3JvdXAoc2VsZWN0ZWQsIGcuaWQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBjdXJyZW50R3JvdXBJZCAhPT0gdW5kZWZpbmVkID8gbG9jYWxpemUoJ21vdmVUb0dyb3VwQWN0aW9uJywgXCJNb3ZlIHRvIEdyb3VwXCIpIDogbG9jYWxpemUoJ2FkZFRvR3JvdXBBY3Rpb24nLCBcIkFkZCB0byBHcm91cFwiKTtcblx0XHRcdGFjdGlvbnMucHVzaChuZXcgU3VibWVudUFjdGlvbignc2Vzc2lvbnMuYWRkVG9Hcm91cFN1Ym1lbnUnLCBsYWJlbCwgc3ViQWN0aW9ucykpO1xuXHRcdH1cblxuXHRcdGlmIChjdXJyZW50R3JvdXBJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IEFjdGlvbignc2Vzc2lvbnMucmVtb3ZlRnJvbUdyb3VwJywgbG9jYWxpemUoJ3JlbW92ZUZyb21Hcm91cEFjdGlvbicsIFwiUmVtb3ZlIGZyb20gR3JvdXBcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2VsZWN0ZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5yZW1vdmVGcm9tR3JvdXAoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIGdldENyZWF0ZUdyb3VwQWN0aW9uKHNlc3Npb25zPzogSVNlc3Npb25bXSk6IElBY3Rpb24ge1xuXHRcdHJldHVybiBuZXcgQWN0aW9uKCdzZXNzaW9ucy5jcmVhdGVHcm91cCcsIGxvY2FsaXplKCdjcmVhdGVHcm91cEFjdGlvbicsIFwiQ3JlYXRlIEdyb3VwXCIpLCB1bmRlZmluZWQsIHRydWUsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChzZXNzaW9ucykge1xuXHRcdFx0XHR0aGlzLmNyZWF0ZUdyb3VwRnJvbVNlc3Npb25zKHNlc3Npb25zKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuY3JlYXRlR3JvdXAoW10pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93Q3JlYXRlR3JvdXBDb250ZXh0TWVudShhbmNob3I6IElUcmVlQ29udGV4dE1lbnVFdmVudDxTZXNzaW9uTGlzdEl0ZW0gfCBudWxsPlsnYW5jaG9yJ10pOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gW3RoaXMuZ2V0Q3JlYXRlR3JvdXBBY3Rpb24oKV0sXG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGFuY2hvcixcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc2hvd0dyb3VwQ29udGV4dE1lbnUoZ3JvdXBJdGVtOiBJU2Vzc2lvbkdyb3VwSXRlbSwgYW5jaG9yOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8U2Vzc2lvbkxpc3RJdGVtPlsnYW5jaG9yJ10pOiB2b2lkIHtcblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXG5cdFx0XHR0aGlzLmdldENyZWF0ZUdyb3VwQWN0aW9uKCksXG5cdFx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0XHRuZXcgQWN0aW9uKCdzZXNzaW9ucy5yZW5hbWVHcm91cEFjdGlvbicsIGxvY2FsaXplKCdyZW5hbWVHcm91cEFjdGlvbicsIFwiUmVuYW1lLi4uXCIpLCB1bmRlZmluZWQsIHRydWUsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5iZWdpblJlbmFtZUdyb3VwKGdyb3VwSXRlbS5ncm91cC5pZCk7XG5cdFx0XHR9KSxcblx0XHRcdG5ldyBBY3Rpb24oJ3Nlc3Npb25zLmRlbGV0ZUdyb3VwQWN0aW9uJywgbG9jYWxpemUoJ2RlbGV0ZUdyb3VwQWN0aW9uJywgXCJEZWxldGUgR3JvdXBcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5kZWxldGVHcm91cChncm91cEl0ZW0uZ3JvdXAuaWQpO1xuXHRcdFx0fSksXG5cdFx0XTtcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gYW5jaG9yLFxuXHRcdH0pO1xuXHR9XG5cblx0cmVzZXRTZWN0aW9uQ29sbGFwc2VTdGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShTZXNzaW9uc0xpc3QuU0VDVElPTl9DT0xMQVBTRV9TVEFURV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0fVxuXG5cdC8vIC0tIFBpbm5pbmcgLS1cblxuXHRwaW5TZXNzaW9uKHNlc3Npb246IElTZXNzaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLnBpblNlc3Npb24oc2Vzc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIHBpblNlc3Npb25zKHNlc3Npb25zOiBJU2Vzc2lvbltdLCB0YXJnZXQ/OiBJU2Vzc2lvbiwgcG9zaXRpb24/OiAnYmVmb3JlJyB8ICdhZnRlcicpOiB2b2lkIHtcblx0XHRjb25zdCBwaW5uYWJsZSA9IHNlc3Npb25zLmZpbHRlcihzZXNzaW9uID0+ICFzZXNzaW9uLmlzQXJjaGl2ZWQuZ2V0KCkpO1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBwaW5uYWJsZSkge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLnBpblNlc3Npb24oc2Vzc2lvbik7XG5cdFx0fVxuXHRcdGlmICh0YXJnZXQgJiYgcG9zaXRpb24pIHtcblx0XHRcdHRoaXMucmVvcmRlclNlc3Npb25zKHBpbm5hYmxlLCB0YXJnZXQsIHBvc2l0aW9uKTtcblx0XHR9XG5cdH1cblxuXHR1bnBpblNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UudW5waW5TZXNzaW9uKHNlc3Npb24pO1xuXHR9XG5cblx0aXNTZXNzaW9uUGlubmVkKHNlc3Npb246IElTZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25zTGlzdE1vZGVsU2VydmljZS5pc1Nlc3Npb25QaW5uZWQoc2Vzc2lvbik7XG5cdH1cblxuXHQvKiogV2hldGhlciBhbnkgcmVnaXN0ZXJlZCBwcm92aWRlciBjYW4gY3JlYXRlIHF1aWNrIGNoYXRzIChnYXRlcyB0aGUgYWx3YXlzLXZpc2libGUgXCJDaGF0c1wiIHNlY3Rpb24pLiAqL1xuXHRwcml2YXRlIF9zb21lUHJvdmlkZXJTdXBwb3J0c1F1aWNrQ2hhdHMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcnMoKS5zb21lKHAgPT4gISFwLnN1cHBvcnRzUXVpY2tDaGF0cyk7XG5cdH1cblxuXHQvLyAtLSBSZWFkL1VucmVhZCAtLVxuXG5cdG1hcmtSZWFkKHNlc3Npb246IElTZXNzaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5tYXJrUmVhZChzZXNzaW9uKTtcblx0fVxuXG5cdG1hcmtVbnJlYWQoc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm1hcmtVbnJlYWQoc2Vzc2lvbik7XG5cdH1cblxuXHQvLyAtLSBTZXNzaW9uIHR5cGUgZmlsdGVyaW5nIC0tXG5cblx0c2V0U2Vzc2lvblR5cGVFeGNsdWRlZChzZXNzaW9uVHlwZUlkOiBzdHJpbmcsIGV4Y2x1ZGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGV4Y2x1ZGVkKSB7XG5cdFx0XHR0aGlzLmV4Y2x1ZGVkU2Vzc2lvblR5cGVzLmFkZChzZXNzaW9uVHlwZUlkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5leGNsdWRlZFNlc3Npb25UeXBlcy5kZWxldGUoc2Vzc2lvblR5cGVJZCk7XG5cdFx0fVxuXHRcdHRoaXMuc2F2ZUV4Y2x1ZGVkU2Vzc2lvblR5cGVzKCk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGlzU2Vzc2lvblR5cGVFeGNsdWRlZChzZXNzaW9uVHlwZUlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5leGNsdWRlZFNlc3Npb25UeXBlcy5oYXMoc2Vzc2lvblR5cGVJZCk7XG5cdH1cblxuXHRwcml2YXRlIGxvYWRFeGNsdWRlZFNlc3Npb25UeXBlcygpOiBTZXQ8c3RyaW5nPiB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoU2Vzc2lvbnNMaXN0LkVYQ0xVREVEX1RZUEVTX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdGlmIChyYXcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGFyciA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoYXJyKSkge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgU2V0KGFycik7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgY29ycnVwdCBkYXRhXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgU2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVFeGNsdWRlZFNlc3Npb25UeXBlcygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5leGNsdWRlZFNlc3Npb25UeXBlcy5zaXplID09PSAwKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShTZXNzaW9uc0xpc3QuRVhDTFVERURfVFlQRVNfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU2Vzc2lvbnNMaXN0LkVYQ0xVREVEX1RZUEVTX0tFWSwgSlNPTi5zdHJpbmdpZnkoWy4uLnRoaXMuZXhjbHVkZWRTZXNzaW9uVHlwZXNdKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0gU3RhdHVzIGZpbHRlcmluZyAtLVxuXG5cdHNldFN0YXR1c0V4Y2x1ZGVkKHN0YXR1czogU2Vzc2lvblN0YXR1cywgZXhjbHVkZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoZXhjbHVkZWQpIHtcblx0XHRcdHRoaXMuZXhjbHVkZWRTdGF0dXNlcy5hZGQoc3RhdHVzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5leGNsdWRlZFN0YXR1c2VzLmRlbGV0ZShzdGF0dXMpO1xuXHRcdH1cblx0XHR0aGlzLnNhdmVFeGNsdWRlZFN0YXR1c2VzKCk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGlzU3RhdHVzRXhjbHVkZWQoc3RhdHVzOiBTZXNzaW9uU3RhdHVzKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZXhjbHVkZWRTdGF0dXNlcy5oYXMoc3RhdHVzKTtcblx0fVxuXG5cdHByaXZhdGUgbG9hZEV4Y2x1ZGVkU3RhdHVzZXMoKTogU2V0PFNlc3Npb25TdGF0dXM+IHtcblx0XHRjb25zdCByYXcgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChTZXNzaW9uc0xpc3QuRVhDTFVERURfU1RBVFVTRVNfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0aWYgKHJhdykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgYXJyID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShhcnIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBTZXQoYXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBjb3JydXB0IGRhdGFcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBTZXQoKTtcblx0fVxuXG5cdHByaXZhdGUgc2F2ZUV4Y2x1ZGVkU3RhdHVzZXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZXhjbHVkZWRTdGF0dXNlcy5zaXplID09PSAwKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShTZXNzaW9uc0xpc3QuRVhDTFVERURfU1RBVFVTRVNfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU2Vzc2lvbnNMaXN0LkVYQ0xVREVEX1NUQVRVU0VTX0tFWSwgSlNPTi5zdHJpbmdpZnkoWy4uLnRoaXMuZXhjbHVkZWRTdGF0dXNlc10pLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLSBBcmNoaXZlZCAvIFJlYWQgZmlsdGVyaW5nIC0tXG5cblx0c2V0RXhjbHVkZUFyY2hpdmVkKGV4Y2x1ZGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9leGNsdWRlQXJjaGl2ZWQgPSBleGNsdWRlO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU2Vzc2lvbnNMaXN0LkVYQ0xVREVfQVJDSElWRURfS0VZLCBleGNsdWRlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0aXNFeGNsdWRlQXJjaGl2ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4Y2x1ZGVBcmNoaXZlZDtcblx0fVxuXG5cdHNldEV4Y2x1ZGVSZWFkKGV4Y2x1ZGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9leGNsdWRlUmVhZCA9IGV4Y2x1ZGU7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTZXNzaW9uc0xpc3QuRVhDTFVERV9SRUFEX0tFWSwgZXhjbHVkZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGlzRXhjbHVkZVJlYWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4Y2x1ZGVSZWFkO1xuXHR9XG5cblx0cmVzZXRGaWx0ZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuZXhjbHVkZWRTZXNzaW9uVHlwZXMuY2xlYXIoKTtcblx0XHR0aGlzLnNhdmVFeGNsdWRlZFNlc3Npb25UeXBlcygpO1xuXHRcdHRoaXMuZXhjbHVkZWRTdGF0dXNlcy5jbGVhcigpO1xuXHRcdHRoaXMuc2F2ZUV4Y2x1ZGVkU3RhdHVzZXMoKTtcblx0XHR0aGlzLl9leGNsdWRlQXJjaGl2ZWQgPSB0cnVlO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU2Vzc2lvbnNMaXN0LkVYQ0xVREVfQVJDSElWRURfS0VZLCB0cnVlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR0aGlzLl9leGNsdWRlUmVhZCA9IGZhbHNlO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU2Vzc2lvbnNMaXN0LkVYQ0xVREVfUkVBRF9LRVksIGZhbHNlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR0aGlzLndvcmtzcGFjZUdyb3VwQ2FwcGVkID0gdHJ1ZTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNlc3Npb25zTGlzdC5XT1JLU1BBQ0VfR1JPVVBfQ0FQUEVEX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0dGhpcy5leHBhbmRlZFNlc3Npb25Hcm91cHMuY2xlYXIoKTtcblx0XHR0aGlzLmV4cGFuZGVkTW9yZUZvbGRlcnMgPSBmYWxzZTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Ly8gU2Vzc2lvbiBncm91cCBjYXBwaW5nXG5cblx0c2V0V29ya3NwYWNlR3JvdXBDYXBwZWQoY2FwcGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy53b3Jrc3BhY2VHcm91cENhcHBlZCA9IGNhcHBlZDtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNlc3Npb25zTGlzdC5XT1JLU1BBQ0VfR1JPVVBfQ0FQUEVEX0tFWSwgY2FwcGVkLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRpZiAoY2FwcGVkKSB7XG5cdFx0XHR0aGlzLmV4cGFuZGVkU2Vzc2lvbkdyb3Vwcy5jbGVhcigpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0aXNXb3Jrc3BhY2VHcm91cENhcHBlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VHcm91cENhcHBlZDtcblx0fVxuXG5cdHNldE9wZW5XaW5kb3dTb3VyY2VGb2xkZXIoZm9sZGVyOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBiZWZvcmUgPSB0aGlzLm9wZW5XaW5kb3dTb3VyY2VGb2xkZXI/LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgYWZ0ZXIgPSBmb2xkZXI/LnRvU3RyaW5nKCk7XG5cdFx0aWYgKGJlZm9yZSA9PT0gYWZ0ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5vcGVuV2luZG93U291cmNlRm9sZGVyID0gZm9sZGVyO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRjb2xsYXBzZUFsbFNlY3Rpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuc3VzcGVuZENvbGxhcHNlU3RhdGVQZXJzaXN0ZW5jZSA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMudHJlZS5jb2xsYXBzZUFsbCgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLnN1c3BlbmRDb2xsYXBzZVN0YXRlUGVyc2lzdGVuY2UgPSBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5zYXZlQnVsa0NvbGxhcHNlU3RhdGUodHJ1ZSk7XG5cdH1cblxuXHQvLyAtLSBTZWN0aW9uIGNvbGxhcHNlIHBlcnNpc3RlbmNlIC0tXG5cblx0cHJpdmF0ZSBnZXRTYXZlZENvbGxhcHNlU3RhdGUoc2VjdGlvbklkOiBzdHJpbmcpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByYXcgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChTZXNzaW9uc0xpc3QuU0VDVElPTl9DT0xMQVBTRV9TVEFURV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRpZiAocmF3KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0ZTogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRcdGlmICh0eXBlb2Ygc3RhdGVbc2VjdGlvbklkXSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHN0YXRlW3NlY3Rpb25JZF07XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgY29ycnVwdCBkYXRhXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVTZWN0aW9uQ29sbGFwc2VTdGF0ZShzZWN0aW9uSWQ6IHN0cmluZywgY29sbGFwc2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0bGV0IHN0YXRlOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFNlc3Npb25zTGlzdC5TRUNUSU9OX0NPTExBUFNFX1NUQVRFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdGlmIChyYXcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdFx0aWYgKHR5cGVvZiBwYXJzZWQgPT09ICdvYmplY3QnICYmIHBhcnNlZCAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG5cdFx0XHRcdFx0c3RhdGUgPSBwYXJzZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgY29ycnVwdCBkYXRhXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHN0YXRlW3NlY3Rpb25JZF0gPSBjb2xsYXBzZWQ7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTZXNzaW9uc0xpc3QuU0VDVElPTl9DT0xMQVBTRV9TVEFURV9LRVksIEpTT04uc3RyaW5naWZ5KHN0YXRlKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVCdWxrQ29sbGFwc2VTdGF0ZShjb2xsYXBzZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZTogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMudHJlZS5nZXROb2RlKG51bGwpLmNoaWxkcmVuKSB7XG5cdFx0XHRpZiAoY2hpbGQuZWxlbWVudCAmJiBpc1Nlc3Npb25TZWN0aW9uKGNoaWxkLmVsZW1lbnQpKSB7XG5cdFx0XHRcdHN0YXRlW2NoaWxkLmVsZW1lbnQuaWRdID0gY29sbGFwc2VkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNlc3Npb25zTGlzdC5TRUNUSU9OX0NPTExBUFNFX1NUQVRFX0tFWSwgSlNPTi5zdHJpbmdpZnkoc3RhdGUpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gQXBwcm92YWwgSGVscGVyc1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Rmlyc3RBcHByb3ZhbEFjcm9zc0NoYXRzKGFwcHJvdmFsTW9kZWw6IEFnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwsIHNlc3Npb246IElTZXNzaW9uLCByZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQsKTogSUFnZW50U2Vzc2lvbkFwcHJvdmFsSW5mbyB8IHVuZGVmaW5lZCB7XG5cdGxldCBvbGRlc3Q6IElBZ2VudFNlc3Npb25BcHByb3ZhbEluZm8gfCB1bmRlZmluZWQ7XG5cdGZvciAoY29uc3QgY2hhdCBvZiBzZXNzaW9uLmNoYXRzLnJlYWQocmVhZGVyKSkge1xuXHRcdGNvbnN0IGFwcHJvdmFsID0gYXBwcm92YWxNb2RlbC5nZXRBcHByb3ZhbChjaGF0LnJlc291cmNlKS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKGFwcHJvdmFsICYmICghb2xkZXN0IHx8IGFwcHJvdmFsLnNpbmNlLmdldFRpbWUoKSA8IG9sZGVzdC5zaW5jZS5nZXRUaW1lKCkpKSB7XG5cdFx0XHRvbGRlc3QgPSBhcHByb3ZhbDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG9sZGVzdDtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBGb2xkZXIgTWF0Y2hpbmdcblxuZnVuY3Rpb24gc2Vzc2lvbk1hdGNoZXNGb2xkZXIoc2Vzc2lvbjogSVNlc3Npb24sIGZvbGRlcjogVVJJKTogYm9vbGVhbiB7XG5cdGNvbnN0IHdvcmtzcGFjZSA9IHNlc3Npb24ud29ya3NwYWNlLmdldCgpO1xuXHRpZiAoIXdvcmtzcGFjZSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBmb2xkZXJTdHIgPSBmb2xkZXIudG9TdHJpbmcoKTtcblx0Zm9yIChjb25zdCBmb2xkZXIgb2Ygd29ya3NwYWNlLmZvbGRlcnMpIHtcblx0XHRpZiAoZm9sZGVyLndvcmtpbmdEaXJlY3Rvcnk/LnRvU3RyaW5nKCkgPT09IGZvbGRlclN0ciB8fCBmb2xkZXIucm9vdC50b1N0cmluZygpID09PSBmb2xkZXJTdHIpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gU29ydGluZyAmIEdyb3VwaW5nIEhlbHBlcnNcblxuZXhwb3J0IGZ1bmN0aW9uIHNvcnRTZXNzaW9ucyhzZXNzaW9uczogSVNlc3Npb25bXSwgc29ydGluZzogU2Vzc2lvbnNTb3J0aW5nLCBnZXRTb3J0S2V5PzogKHNlc3Npb246IElTZXNzaW9uLCBzb3J0aW5nOiBTZXNzaW9uc1NvcnRpbmcpID0+IG51bWJlcik6IElTZXNzaW9uW10ge1xuXHRjb25zdCBrZXkgPSBnZXRTb3J0S2V5ID8/IGRlZmF1bHRTb3J0S2V5O1xuXHRyZXR1cm4gWy4uLnNlc3Npb25zXS5zb3J0KChhLCBiKSA9PiBrZXkoYiwgc29ydGluZykgLSBrZXkoYSwgc29ydGluZykpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uTGltaXRSZXN1bHQge1xuXHRyZWFkb25seSBzZXNzaW9uczogcmVhZG9ubHkgSVNlc3Npb25bXTtcblx0cmVhZG9ubHkgc2hvd01vcmU6IElTZXNzaW9uU2hvd01vcmUgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsaW1pdFNlc3Npb25zRm9yTGlzdChcblx0c2Vzc2lvbnM6IHJlYWRvbmx5IElTZXNzaW9uW10sXG5cdGxpbWl0OiBudW1iZXIsXG5cdG9wdGlvbnM6IHsgcmVhZG9ubHkgZW5hYmxlZDogYm9vbGVhbjsgcmVhZG9ubHkgZXhwYW5kZWQ6IGJvb2xlYW47IHJlYWRvbmx5IHNlY3Rpb25JZDogc3RyaW5nOyByZWFkb25seSBzZWN0aW9uTGFiZWw6IHN0cmluZyB9LFxuKTogSVNlc3Npb25MaW1pdFJlc3VsdCB7XG5cdGlmICghb3B0aW9ucy5lbmFibGVkIHx8IHNlc3Npb25zLmxlbmd0aCA8PSBsaW1pdCkge1xuXHRcdHJldHVybiB7IHNlc3Npb25zLCBzaG93TW9yZTogdW5kZWZpbmVkIH07XG5cdH1cblxuXHRpZiAob3B0aW9ucy5leHBhbmRlZCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXNzaW9ucyxcblx0XHRcdHNob3dNb3JlOiB7XG5cdFx0XHRcdHNob3dNb3JlOiB0cnVlLFxuXHRcdFx0XHRraW5kOiAnc2Vzc2lvbnMnLFxuXHRcdFx0XHRtb2RlOiAnbGVzcycsXG5cdFx0XHRcdHNlY3Rpb25JZDogb3B0aW9ucy5zZWN0aW9uSWQsXG5cdFx0XHRcdHNlY3Rpb25MYWJlbDogb3B0aW9ucy5zZWN0aW9uTGFiZWwsXG5cdFx0XHRcdHJlbWFpbmluZ0NvdW50OiAwLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRzZXNzaW9uczogc2Vzc2lvbnMuc2xpY2UoMCwgbGltaXQpLFxuXHRcdHNob3dNb3JlOiB7XG5cdFx0XHRzaG93TW9yZTogdHJ1ZSxcblx0XHRcdGtpbmQ6ICdzZXNzaW9ucycsXG5cdFx0XHRtb2RlOiAnbW9yZScsXG5cdFx0XHRzZWN0aW9uSWQ6IG9wdGlvbnMuc2VjdGlvbklkLFxuXHRcdFx0c2VjdGlvbkxhYmVsOiBvcHRpb25zLnNlY3Rpb25MYWJlbCxcblx0XHRcdHJlbWFpbmluZ0NvdW50OiBzZXNzaW9ucy5sZW5ndGggLSBsaW1pdCxcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBkZWZhdWx0U29ydEtleShzZXNzaW9uOiBJU2Vzc2lvbiwgc29ydGluZzogU2Vzc2lvbnNTb3J0aW5nKTogbnVtYmVyIHtcblx0aWYgKHNvcnRpbmcgPT09IFNlc3Npb25zU29ydGluZy5VcGRhdGVkKSB7XG5cdFx0cmV0dXJuIHNlc3Npb24udXBkYXRlZEF0LmdldCgpLmdldFRpbWUoKTtcblx0fVxuXHRyZXR1cm4gc2Vzc2lvbi5jcmVhdGVkQXQuZ2V0VGltZSgpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZW9yZGVyU29ydElucHV0IHtcblx0LyoqIERyYWdnZWQgc2Vzc2lvbiBpZHMgaW4gZGlzcGxheSAoZGVzY2VuZGluZy1rZXkpIG9yZGVyLiAqL1xuXHRyZWFkb25seSBkcmFnZ2VkSWRzOiByZWFkb25seSBzdHJpbmdbXTtcblx0LyoqIE5hdHVyYWwgc29ydCBrZXkgcGVyIGRyYWdnZWQgc2Vzc2lvbiAoc2FtZSBvcmRlciBhcyB7QGxpbmsgZHJhZ2dlZElkc30pLiAqL1xuXHRyZWFkb25seSBuYXR1cmFsS2V5czogcmVhZG9ubHkgbnVtYmVyW107XG5cdC8qKiBFZmZlY3RpdmUga2V5IG9mIHRoZSBuZWlnaGJvdXIgYWJvdmUgdGhlIGRyb3AgcG9pbnQgKGhpZ2hlciksIGlmIGFueS4gKi9cblx0cmVhZG9ubHkgYWJvdmVLZXk6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0LyoqIEVmZmVjdGl2ZSBrZXkgb2YgdGhlIG5laWdoYm91ciBiZWxvdyB0aGUgZHJvcCBwb2ludCAobG93ZXIpLCBpZiBhbnkuICovXG5cdHJlYWRvbmx5IGJlbG93S2V5OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdC8qKiBDdXJyZW50IHRpbWUsIHVzZWQgd2hlbiBkcm9wcGluZyBhYm92ZSB0aGUgZmlyc3Qgc2Vzc2lvbi4gKi9cblx0cmVhZG9ubHkgbm93OiBudW1iZXI7XG5cdC8qKiBTcGFjaW5nIHVzZWQgd2hlbiBzdGVwcGluZyBwYXN0IGFuIG9wZW4gYm91bmRhcnkuICovXG5cdHJlYWRvbmx5IGZhbGxiYWNrU3RlcDogbnVtYmVyO1xufVxuXG4vKipcbiAqIENvbXB1dGUgdGhlIG1hbnVhbCBzb3J0LW92ZXJyaWRlIGNoYW5nZXMgZm9yIGEgcmVvcmRlciBkcm9wLiBBc3NpZ25zIHRoZVxuICogZHJhZ2dlZCBibG9jayBzdHJpY3RseS1kZXNjZW5kaW5nIHN5bnRoZXRpYyBrZXlzIHNwcmVhZCBiZXR3ZWVuIHRoZVxuICogc3Vycm91bmRpbmcgbmVpZ2hib3VycywgZXhjZXB0IHdoZW4gdGhlIHNlc3Npb25zJyBuYXR1cmFsIGtleXMgYWxyZWFkeSBzb3J0XG4gKiB0aGVtIGludG8gdGhlIGRyb3BwZWQgc2xvdCBcdTIwMTQgaW4gd2hpY2ggY2FzZSBhbnkgZXhpc3Rpbmcgb3ZlcnJpZGUgaXMgZHJvcHBlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVSZW9yZGVyU29ydENoYW5nZXMoaW5wdXQ6IElSZW9yZGVyU29ydElucHV0KTogeyBzZXQ6IE1hcDxzdHJpbmcsIG51bWJlcj47IGNsZWFyOiBzdHJpbmdbXSB9IHtcblx0Y29uc3QgeyBkcmFnZ2VkSWRzLCBuYXR1cmFsS2V5cywgYWJvdmVLZXksIGJlbG93S2V5LCBub3csIGZhbGxiYWNrU3RlcCB9ID0gaW5wdXQ7XG5cdGNvbnN0IGNvdW50ID0gZHJhZ2dlZElkcy5sZW5ndGg7XG5cblx0Ly8gXCJEcm9wIHRoZSBmYWtlIHZhbHVlXCI6IHdoZW4gZXZlcnkgZHJhZ2dlZCBzZXNzaW9uJ3MgbmF0dXJhbCBrZXkgYWxyZWFkeVxuXHQvLyBsYW5kcyBzdHJpY3RseSBpbnNpZGUgdGhlIHN1cnJvdW5kaW5nIGdhcCAoYW5kIGluIGRlc2NlbmRpbmcgZGlzcGxheVxuXHQvLyBvcmRlciksIGNsZWFyIG92ZXJyaWRlcyBpbnN0ZWFkIG9mIHN0b3Jpbmcgc3ludGhldGljIGtleXMuXG5cdGNvbnN0IHVwcGVyRml0ID0gYWJvdmVLZXkgPz8gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXHRjb25zdCBsb3dlckZpdCA9IGJlbG93S2V5ID8/IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcblx0bGV0IG5hdHVyYWxGaXRzID0gdHJ1ZTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG5cdFx0aWYgKCEobmF0dXJhbEtleXNbaV0gPCB1cHBlckZpdCAmJiBuYXR1cmFsS2V5c1tpXSA+IGxvd2VyRml0KSkge1xuXHRcdFx0bmF0dXJhbEZpdHMgPSBmYWxzZTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRpZiAoaSA+IDAgJiYgIShuYXR1cmFsS2V5c1tpXSA8IG5hdHVyYWxLZXlzW2kgLSAxXSkpIHtcblx0XHRcdG5hdHVyYWxGaXRzID0gZmFsc2U7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRjb25zdCBzZXQgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRjb25zdCBjbGVhcjogc3RyaW5nW10gPSBbXTtcblx0aWYgKG5hdHVyYWxGaXRzKSB7XG5cdFx0Zm9yIChjb25zdCBpZCBvZiBkcmFnZ2VkSWRzKSB7XG5cdFx0XHRjbGVhci5wdXNoKGlkKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Ly8gU3ByZWFkIGBjb3VudGAgc3RyaWN0bHktZGVzY2VuZGluZyBzeW50aGV0aWMga2V5cyBhY3Jvc3MgdGhlIGdhcC4gQW5cblx0XHQvLyBvcGVuIHRvcCBib3VuZGFyeSB1c2VzIHRoZSBjdXJyZW50IHRpbWUgc28gdGhlIGJsb2NrIHNvcnRzIHRvIHRoZSB2ZXJ5XG5cdFx0Ly8gdG9wOyBhbiBvcGVuIGJvdHRvbSBib3VuZGFyeSBzdGVwcyBiZWxvdyB0aGUgbGFzdCBrZXkuXG5cdFx0Y29uc3QgdXBwZXIgPSBhYm92ZUtleSA/PyBub3c7XG5cdFx0Y29uc3QgbG93ZXIgPSBiZWxvd0tleSA/PyAodXBwZXIgLSAoY291bnQgKyAxKSAqIGZhbGxiYWNrU3RlcCk7XG5cdFx0Y29uc3Qgc3RlcCA9ICh1cHBlciAtIGxvd2VyKSAvIChjb3VudCArIDEpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuXHRcdFx0c2V0LnNldChkcmFnZ2VkSWRzW2ldLCB1cHBlciAtIChpICsgMSkgKiBzdGVwKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHsgc2V0LCBjbGVhciB9O1xufVxuXG4vKiogRml4ZWQgc2VjdGlvbiBpZCBmb3Igd29ya3NwYWNlLWxlc3MgXCJxdWljayBjaGF0XCIgc2Vzc2lvbnMuICovXG5leHBvcnQgY29uc3QgUVVJQ0tfQ0hBVFNfU0VDVElPTl9JRCA9ICdxdWlja2NoYXRzJztcblxuLyoqXG4gKiBXaGV0aGVyIGEgc2Vzc2lvbiBpcyBhIHdvcmtzcGFjZS1sZXNzIFwicXVpY2sgY2hhdFwiLCBwZXIgdGhlIHNlc3Npb24ncyBvd25cbiAqIHtAbGluayBJU2Vzc2lvbi5pc1F1aWNrQ2hhdH0gZmxhZyAoYWJzZW50IG1lYW5zIGBmYWxzZWApLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNRdWlja0NoYXRTZXNzaW9uKHNlc3Npb246IElTZXNzaW9uKTogYm9vbGVhbiB7XG5cdHJldHVybiBzZXNzaW9uLmlzUXVpY2tDaGF0Py5nZXQoKSA/PyBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdyb3VwU2Vzc2lvbnNGb3JMaXN0KFxuXHRzZXNzaW9uczogSVNlc3Npb25bXSxcblx0Z3JvdXBpbmc6IFNlc3Npb25zR3JvdXBpbmcsXG5cdHNvcnRpbmc6IFNlc3Npb25zU29ydGluZyxcblx0aXNTZXNzaW9uUGlubmVkOiAoc2Vzc2lvbjogSVNlc3Npb24pID0+IGJvb2xlYW4sXG5cdGdldFNvcnRLZXk/OiAoc2Vzc2lvbjogSVNlc3Npb24sIHNvcnRpbmc6IFNlc3Npb25zU29ydGluZykgPT4gbnVtYmVyLFxuKTogSVNlc3Npb25TZWN0aW9uW10ge1xuXHRjb25zdCBzb3J0ZWQgPSBzb3J0U2Vzc2lvbnMoc2Vzc2lvbnMsIHNvcnRpbmcsIGdldFNvcnRLZXkpO1xuXG5cdC8vIEFyY2hpdmVkIHdpbnMgb3ZlciBwaW5uZWQgKGRvbmUgc2Vzc2lvbnMgc3RheSBncm91cGVkKTsgcGlubmVkIHdpbnMgb3ZlciB0aGVcblx0Ly8gcXVpY2stY2hhdHMgYnVja2V0IHNvIGEgcGlubmVkIHF1aWNrIGNoYXQgc3RpbGwgc3VyZmFjZXMgaW4gUGlubmVkLlxuXHRjb25zdCBwaW5uZWQ6IElTZXNzaW9uW10gPSBbXTtcblx0Y29uc3QgYXJjaGl2ZWQ6IElTZXNzaW9uW10gPSBbXTtcblx0Y29uc3QgcXVpY2tDaGF0czogSVNlc3Npb25bXSA9IFtdO1xuXHRjb25zdCByZWd1bGFyOiBJU2Vzc2lvbltdID0gW107XG5cdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzb3J0ZWQpIHtcblx0XHRpZiAoc2Vzc2lvbi5pc0FyY2hpdmVkLmdldCgpKSB7XG5cdFx0XHRhcmNoaXZlZC5wdXNoKHNlc3Npb24pO1xuXHRcdH0gZWxzZSBpZiAoaXNTZXNzaW9uUGlubmVkKHNlc3Npb24pKSB7XG5cdFx0XHRwaW5uZWQucHVzaChzZXNzaW9uKTtcblx0XHR9IGVsc2UgaWYgKGlzUXVpY2tDaGF0U2Vzc2lvbihzZXNzaW9uKSkge1xuXHRcdFx0cXVpY2tDaGF0cy5wdXNoKHNlc3Npb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZWd1bGFyLnB1c2goc2Vzc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3Qgc2VjdGlvbnM6IElTZXNzaW9uU2VjdGlvbltdID0gW107XG5cdGlmIChwaW5uZWQubGVuZ3RoID4gMCkge1xuXHRcdHNlY3Rpb25zLnB1c2goeyBpZDogJ3Bpbm5lZCcsIGxhYmVsOiBsb2NhbGl6ZSgncGlubmVkJywgXCJQaW5uZWRcIiksIHNlc3Npb25zOiBwaW5uZWQgfSk7XG5cdH1cblxuXHQvLyBRdWljayBjaGF0cyByZW5kZXIgYXMgYSBzaW5nbGUgXCJDaGF0c1wiIGVudHJ5IGRpcmVjdGx5IGJlbG93IFBpbm5lZCAoYWJvdmVcblx0Ly8gdGhlIHdvcmtzcGFjZS9kYXRlIGdyb3VwcyksIHJlZ2FyZGxlc3Mgb2YgZ3JvdXBpbmcgbW9kZS5cblx0aWYgKHF1aWNrQ2hhdHMubGVuZ3RoID4gMCkge1xuXHRcdHNlY3Rpb25zLnB1c2goeyBpZDogUVVJQ0tfQ0hBVFNfU0VDVElPTl9JRCwgbGFiZWw6IGxvY2FsaXplKCdjaGF0c1NlY3Rpb24nLCBcIkNoYXRzXCIpLCBzZXNzaW9uczogcXVpY2tDaGF0cyB9KTtcblx0fVxuXG5cdHNlY3Rpb25zLnB1c2goLi4uKGdyb3VwaW5nID09PSBTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZVxuXHRcdD8gZ3JvdXBCeVdvcmtzcGFjZShyZWd1bGFyKVxuXHRcdDogZ3JvdXBCeURhdGUocmVndWxhciwgc29ydGluZywgZ2V0U29ydEtleSkpKTtcblxuXHRpZiAoYXJjaGl2ZWQubGVuZ3RoID4gMCkge1xuXHRcdHNlY3Rpb25zLnB1c2goeyBpZDogJ2FyY2hpdmVkJywgbGFiZWw6IGxvY2FsaXplKCdhcmNoaXZlZCcsIFwiRG9uZVwiKSwgc2Vzc2lvbnM6IGFyY2hpdmVkIH0pO1xuXHR9XG5cblx0cmV0dXJuIHNlY3Rpb25zO1xufVxuXG4vKiogVGhlIHdvcmtzcGFjZSBncm91cCBsYWJlbCBhIHNlc3Npb24gYmVsb25ncyB0byAobWF0Y2hlcyB7QGxpbmsgZ3JvdXBCeVdvcmtzcGFjZX0pLiAqL1xuZnVuY3Rpb24gc2Vzc2lvbldvcmtzcGFjZUxhYmVsKHNlc3Npb246IElTZXNzaW9uKTogc3RyaW5nIHtcblx0cmV0dXJuIHNlc3Npb24ud29ya3NwYWNlLmdldCgpPy5sYWJlbCB8fCBsb2NhbGl6ZSgndW5rbm93bicsIFwiVW5rbm93blwiKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdyb3VwQnlXb3Jrc3BhY2Uoc2Vzc2lvbnM6IElTZXNzaW9uW10pOiBJU2Vzc2lvblNlY3Rpb25bXSB7XG5cdGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBJU2Vzc2lvbltdPigpO1xuXHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRjb25zdCBsYWJlbCA9IHNlc3Npb25Xb3Jrc3BhY2VMYWJlbChzZXNzaW9uKTtcblx0XHRsZXQgZ3JvdXAgPSBncm91cHMuZ2V0KGxhYmVsKTtcblx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRncm91cCA9IFtdO1xuXHRcdFx0Z3JvdXBzLnNldChsYWJlbCwgZ3JvdXApO1xuXHRcdH1cblx0XHRncm91cC5wdXNoKHNlc3Npb24pO1xuXHR9XG5cblx0Y29uc3QgdW5rbm93bldvcmtzcGFjZUxhYmVsID0gbG9jYWxpemUoJ3Vua25vd24nLCBcIlVua25vd25cIik7XG5cdGNvbnN0IG9yZGVyID0gWy4uLmdyb3Vwcy5rZXlzKCldXG5cdFx0LmZpbHRlcihrID0+IGsgIT09IHVua25vd25Xb3Jrc3BhY2VMYWJlbClcblx0XHQuc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKTtcblxuXHRjb25zdCByZXN1bHQ6IElTZXNzaW9uU2VjdGlvbltdID0gb3JkZXIubWFwKGxhYmVsID0+ICh7XG5cdFx0aWQ6IGB3b3Jrc3BhY2U6JHtsYWJlbH1gLFxuXHRcdGxhYmVsLFxuXHRcdHNlc3Npb25zOiBncm91cHMuZ2V0KGxhYmVsKSEsXG5cdH0pKTtcblxuXHQvLyBcIlVua25vd24gV29ya3NwYWNlXCIgYWx3YXlzIGF0IHRoZSBib3R0b21cblx0Y29uc3QgdW5rbm93bldvcmtzcGFjZSA9IGdyb3Vwcy5nZXQodW5rbm93bldvcmtzcGFjZUxhYmVsKTtcblx0aWYgKHVua25vd25Xb3Jrc3BhY2UpIHtcblx0XHRyZXN1bHQucHVzaCh7IGlkOiBgd29ya3NwYWNlOiR7dW5rbm93bldvcmtzcGFjZUxhYmVsfWAsIGxhYmVsOiB1bmtub3duV29ya3NwYWNlTGFiZWwsIHNlc3Npb25zOiB1bmtub3duV29ya3NwYWNlIH0pO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqIE1heGltdW0gbnVtYmVyIG9mIHNlc3Npb25zIHNob3duIGluIHRoZSBcIlJlY2VudFwiIGRhdGUgc2VjdGlvbi4gKi9cbmNvbnN0IFJFQ0VOVF9TRVNTSU9OU19MSU1JVCA9IDEwO1xuXG5leHBvcnQgZnVuY3Rpb24gZ3JvdXBCeURhdGUoc2Vzc2lvbnM6IElTZXNzaW9uW10sIHNvcnRpbmc6IFNlc3Npb25zU29ydGluZywgZ2V0U29ydEtleT86IChzZXNzaW9uOiBJU2Vzc2lvbiwgc29ydGluZzogU2Vzc2lvbnNTb3J0aW5nKSA9PiBudW1iZXIpOiBJU2Vzc2lvblNlY3Rpb25bXSB7XG5cdGNvbnN0IGtleSA9IGdldFNvcnRLZXkgPz8gZGVmYXVsdFNvcnRLZXk7XG5cdGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG5cdGNvbnN0IHN0YXJ0T2ZUb2RheSA9IG5ldyBEYXRlKG5vdy5nZXRGdWxsWWVhcigpLCBub3cuZ2V0TW9udGgoKSwgbm93LmdldERhdGUoKSkuZ2V0VGltZSgpO1xuXHRjb25zdCBzdGFydE9mV2VlayA9IHN0YXJ0T2ZUb2RheSAtIDcgKiA4Nl80MDBfMDAwO1xuXG5cdGNvbnN0IHJlY2VudDogSVNlc3Npb25bXSA9IFtdO1xuXHRjb25zdCBvbGRlcjogSVNlc3Npb25bXSA9IFtdO1xuXG5cdC8vIGBzZXNzaW9uc2AgYXJyaXZlIHNvcnRlZCBtb3N0LXJlY2VudC1maXJzdCwgc28gdGhlIGZpcnN0IHNlc3Npb25zIHdpdGhpblxuXHQvLyB0aGUgbGFzdCA3IGRheXMgKGNhcHBlZCBhdCBSRUNFTlRfU0VTU0lPTlNfTElNSVQpIGZvcm0gdGhlIFwiUmVjZW50XCJcblx0Ly8gc2VjdGlvbjsgZXZlcnl0aGluZyBlbHNlIGZhbGxzIGludG8gXCJPbGRlclwiLlxuXHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRjb25zdCB0aW1lID0ga2V5KHNlc3Npb24sIHNvcnRpbmcpO1xuXG5cdFx0aWYgKHRpbWUgPj0gc3RhcnRPZldlZWsgJiYgcmVjZW50Lmxlbmd0aCA8IFJFQ0VOVF9TRVNTSU9OU19MSU1JVCkge1xuXHRcdFx0cmVjZW50LnB1c2goc2Vzc2lvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG9sZGVyLnB1c2goc2Vzc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3Qgc2VjdGlvbnM6IElTZXNzaW9uU2VjdGlvbltdID0gW107XG5cdGNvbnN0IGFkZEdyb3VwID0gKGlkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIGdyb3VwU2Vzc2lvbnM6IElTZXNzaW9uW10pID0+IHtcblx0XHRpZiAoZ3JvdXBTZXNzaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRzZWN0aW9ucy5wdXNoKHsgaWQsIGxhYmVsLCBzZXNzaW9uczogZ3JvdXBTZXNzaW9ucyB9KTtcblx0XHR9XG5cdH07XG5cblx0YWRkR3JvdXAoJ3JlY2VudCcsIGxvY2FsaXplKCdyZWNlbnQnLCBcIlJlY2VudFwiKSwgcmVjZW50KTtcblx0YWRkR3JvdXAoJ29sZGVyJywgbG9jYWxpemUoJ29sZGVyJywgXCJPbGRlclwiKSwgb2xkZXIpO1xuXG5cdHJldHVybiBzZWN0aW9ucztcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBGbGF0IExpc3RcblxuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvbnNGbGF0TGlzdE9wdGlvbnMge1xuXHRyZWFkb25seSBvdmVycmlkZVN0eWxlcz86IElTdHlsZU92ZXJyaWRlPElMaXN0U3R5bGVzPjtcblx0cmVhZG9ubHkgc2hvd1Nlc3Npb25Ib3Zlcj86IGJvb2xlYW47XG5cdC8qKiBDYWxsZWQgd2hlbiBhIHNlc3Npb24gcm93IGlzIG9wZW5lZCAoY2xpY2tlZCAvIGFjdGl2YXRlZCkuICovXG5cdG9uU2Vzc2lvbk9wZW4ocmVzb3VyY2U6IFVSSSwgcHJlc2VydmVGb2N1czogYm9vbGVhbiwgc2lkZUJ5U2lkZTogYm9vbGVhbik6IHZvaWQ7XG5cdC8qKlxuXHQgKiBBcHByb3ZhbCBtb2RlbCB0cmFja2luZyBwZW5kaW5nIHRvb2wgY29uZmlybWF0aW9ucyBmb3IgdGhlIHNob3duIHNlc3Npb25zLlxuXHQgKiBXaGVuIG9taXR0ZWQgdGhlIGxpc3QgY3JlYXRlcyBhbmQgb3ducyBpdHMgb3duOyBpbmplY3RhYmxlIHNvIHRlc3RzIGFuZFxuXHQgKiBmaXh0dXJlcyBjYW4gc3VwcGx5IHBlbmRpbmcgYXBwcm92YWxzIHdpdGhvdXQgYSBsaXZlIGNoYXQgc2Vzc2lvbi5cblx0ICovXG5cdHJlYWRvbmx5IGFwcHJvdmFsTW9kZWw/OiBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsO1xuXHQvKipcblx0ICogU3VwcGxpZXMgdGhlIHBlci1zZXNzaW9uIFwiRml4IENJXCIgcm93IGZvciBzZXNzaW9ucyB3aG9zZSBwdWxsIHJlcXVlc3QgaGFzXG5cdCAqIGZhaWxpbmcgQ0kgY2hlY2tzLiBPbmx5IHRoZSBibG9ja2VkLXNlc3Npb25zIGRyb3Bkb3duIHBhc3NlcyBvbmUsIHNvIHRoZSByb3dcblx0ICogbmV2ZXIgYXBwZWFycyBpbiBvdGhlciBsaXN0cy4gV2hlbiBvbWl0dGVkIG5vIGZpeC1DSSByb3dzIGFyZSByZW5kZXJlZC5cblx0ICovXG5cdHJlYWRvbmx5IGNpRml4TW9kZWw/OiBJU2Vzc2lvbkNJRml4TW9kZWw7XG5cdC8qKlxuXHQgKiBNYXhpbXVtIG51bWJlciBvZiB0ZXJtaW5hbC1jb21tYW5kIGxpbmVzIHNob3duIGluIGEgc2Vzc2lvbidzIGFwcHJvdmFsXG5cdCAqIHByb21wdC4gRGVmYXVsdHMgdG8gdGhlIHNhbWUgbGltaXQgYXMgdGhlIG1haW4gc2Vzc2lvbnMgbGlzdDsgdGhlXG5cdCAqIGJsb2NrZWQtc2Vzc2lvbnMgZHJvcGRvd24gcGFzc2VzIGEgbGFyZ2VyIHZhbHVlLlxuXHQgKi9cblx0cmVhZG9ubHkgYXBwcm92YWxSb3dNYXhMaW5lcz86IG51bWJlcjtcblx0LyoqXG5cdCAqIE1lbnUgdXNlZCBieSBlYWNoIHNlc3Npb24gcm93J3MgaW5saW5lIHRvb2xiYXIuIERlZmF1bHRzIHRvIHRoZSBtYWluIHNlc3Npb25zXG5cdCAqIGl0ZW0gdG9vbGJhciBtZW51LlxuXHQgKi9cblx0cmVhZG9ubHkgdG9vbGJhck1lbnVJZD86IE1lbnVJZDtcblx0LyoqIEFsbG93cyBmb2N1c2VkIGxpc3Qgc3VyZmFjZXMgdG8gaGFuZGxlIGFjdGlvbnMgZnJvbSB0aGVpciBjdXN0b20gdG9vbGJhciBtZW51LiAqL1xuXHRyZWFkb25seSBvblRvb2xiYXJBY3Rpb24/OiAoYWN0aW9uOiBJQWN0aW9uLCBzZXNzaW9uOiBJU2Vzc2lvbikgPT4gYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj47XG59XG5cbi8qKlxuICogQSBsaWdodHdlaWdodCwgZmxhdCBzZXNzaW9ucyBsaXN0IHRoYXQgcmVuZGVycyBzZXNzaW9uIHJvd3MgZXhhY3RseSBsaWtlIHRoZVxuICogbWFpbiB7QGxpbmsgU2Vzc2lvbnNMaXN0fSBidXQgd2l0aG91dCBhbnkgc2VjdGlvbnMsIGdyb3VwcyBvciB3b3Jrc3BhY2VcbiAqIGhlYWRlcnMuIE9ubHkgdGhlIHNlc3Npb25zIHBhc3NlZCB0byB7QGxpbmsgc2V0U2Vzc2lvbnN9IGFyZSBzaG93bi4gVXNlZCBieVxuICogc3VyZmFjZXMgdGhhdCBuZWVkIGEgZm9jdXNlZCwgc2VjdGlvbmxlc3MgdmlldyBvZiBhIHNwZWNpZmljIHNldCBvZiBzZXNzaW9uc1xuICogKGUuZy4gdGhlIHRpdGxlYmFyIFwiTiBibG9ja2VkXCIgaG92ZXIpLlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbnNGbGF0TGlzdCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJPV19IRUlHSFQgPSA1NDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0ID0gdGhpcy5fb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFwcHJvdmVTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUFwcHJvdmVkU2Vzc2lvbj4oKSk7XG5cdC8qKiBGaXJlcyB3aGVuIGEgc2Vzc2lvbidzIHBlbmRpbmcgYWN0aW9uIGlzIGFwcHJvdmVkIGZyb20gaXRzIFwiQWxsb3dcIiBidXR0b24uICovXG5cdHJlYWRvbmx5IG9uRGlkQXBwcm92ZVNlc3Npb246IEV2ZW50PElBcHByb3ZlZFNlc3Npb24+ID0gdGhpcy5fb25EaWRBcHByb3ZlU2Vzc2lvbi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSB0cmVlOiBXb3JrYmVuY2hPYmplY3RUcmVlPFNlc3Npb25MaXN0SXRlbSwgRnV6enlTY29yZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlbGVnYXRlOiBTZXNzaW9uc1RyZWVEZWxlZ2F0ZTtcblx0cHJpdmF0ZSBfc2Vzc2lvbnM6IHJlYWRvbmx5IElTZXNzaW9uW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogSVNlc3Npb25zRmxhdExpc3RPcHRpb25zLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASVNlc3Npb25zTGlzdE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2U6IElTZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0QElWb2ljZVBsYXliYWNrU2VydmljZSB2b2ljZVBsYXliYWNrU2VydmljZTogSVZvaWNlUGxheWJhY2tTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gV3JhcCBpbiBgLnNlc3Npb25zLWxpc3QtY29udHJvbGAgc28gdGhlIHJvdyBzdHlsZXMgc2NvcGVkIHRvIHRoYXQgY2xhc3Ncblx0XHQvLyAobmVlZHMtaW5wdXQvcGlubmVkIHJvdyBoaWdobGlnaHRzKSBhcHBseSBleGFjdGx5IGxpa2UgdGhlIG1haW4gbGlzdC5cblx0XHRjb25zdCBsaXN0Um9vdCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2Vzc2lvbnMtbGlzdC1jb250cm9sJykpO1xuXHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSB0aGlzLm9wdGlvbnMuYXBwcm92YWxNb2RlbCA/PyB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsKSk7XG5cblx0XHQvLyBURU1QT1JBUlkgKCMzMjA0ODApOiB0aGUgcm93IHJlbmRlcmVyIHJlYWNoZXMgaW50byBhIENvcGlsb3QtcHJvdmlkZXJcblx0XHQvLyBpbnRlcm5hbCB0byBsYXppbHkgcmVzb2x2ZSBleHBlbnNpdmUgc2Vzc2lvbiBwcm9wZXJ0aWVzLiBSZXNvbHZlZCB2aWFcblx0XHQvLyB0aGUgaW5zdGFudGlhdGlvbiBzZXJ2aWNlIHNvIHRoaXMgZmlsZSdzIHNpbmdsZSBzdXBwcmVzc2VkIGltcG9ydCBzdGF5c1xuXHRcdC8vIHRoZSBvbmx5IHJlZmVyZW5jZS4gU2VlIHRoZSBub3RlIG9uIHRoZSBgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlYCBpbXBvcnQuXG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uc1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uUmVuZGVyZXIgPSBuZXcgU2Vzc2lvbkl0ZW1SZW5kZXJlcihcblx0XHRcdHtcblx0XHRcdFx0Z3JvdXBpbmc6ICgpID0+IFNlc3Npb25zR3JvdXBpbmcuRGF0ZSxcblx0XHRcdFx0aXNQaW5uZWQ6IHMgPT4gdGhpcy5fc2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLmlzU2Vzc2lvblBpbm5lZChzKSxcblx0XHRcdFx0aXNSZWFkOiBzID0+IHMuaXNSZWFkLmdldCgpLFxuXHRcdFx0XHR2aXNpYmxlU2Vzc2lvbnM6IHRoaXMuX3Nlc3Npb25zU2VydmljZS52aXNpYmxlU2Vzc2lvbnMsXG5cdFx0XHRcdGdldE11bHRpU2VsZWN0ZWRTZXNzaW9uczogcyA9PiBbc10sXG5cdFx0XHRcdHNob3dIb3ZlcjogdGhpcy5vcHRpb25zLnNob3dTZXNzaW9uSG92ZXIgPz8gdHJ1ZSxcblx0XHRcdFx0YXBwcm92YWxSb3dNYXhMaW5lczogdGhpcy5vcHRpb25zLmFwcHJvdmFsUm93TWF4TGluZXMgPz8gREVGQVVMVF9BUFBST1ZBTF9ST1dfTUFYX0xJTkVTLFxuXHRcdFx0XHR0b29sYmFyTWVudUlkOiB0aGlzLm9wdGlvbnMudG9vbGJhck1lbnVJZCA/PyBTZXNzaW9uSXRlbVRvb2xiYXJNZW51SWQsXG5cdFx0XHRcdGhhbmRsZVRvb2xiYXJBY3Rpb246IHRoaXMub3B0aW9ucy5vblRvb2xiYXJBY3Rpb24sXG5cdFx0XHR9LFxuXHRcdFx0YXBwcm92YWxNb2RlbCxcblx0XHRcdHRoaXMub3B0aW9ucy5jaUZpeE1vZGVsLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZSxcblx0XHRcdG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdFx0aG92ZXJTZXJ2aWNlLFxuXHRcdFx0c2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0YWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0XHR2b2ljZVBsYXliYWNrU2VydmljZSxcblx0XHQpO1xuXG5cdFx0dGhpcy5fZGVsZWdhdGUgPSBuZXcgU2Vzc2lvbnNUcmVlRGVsZWdhdGUoYXBwcm92YWxNb2RlbCwgKCkgPT4gZmFsc2UsIHRoaXMub3B0aW9ucy5hcHByb3ZhbFJvd01heExpbmVzID8/IERFRkFVTFRfQVBQUk9WQUxfUk9XX01BWF9MSU5FUywgdGhpcy5vcHRpb25zLmNpRml4TW9kZWwpO1xuXG5cdFx0dGhpcy50cmVlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hPYmplY3RUcmVlPFNlc3Npb25MaXN0SXRlbSwgRnV6enlTY29yZT4sXG5cdFx0XHQnU2Vzc2lvbnNGbGF0TGlzdCcsXG5cdFx0XHRsaXN0Um9vdCxcblx0XHRcdHRoaXMuX2RlbGVnYXRlLFxuXHRcdFx0W3Nlc3Npb25SZW5kZXJlcl0sXG5cdFx0XHR7XG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IFNlc3Npb25zQWNjZXNzaWJpbGl0eVByb3ZpZGVyKCksXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZDogKGVsZW1lbnQ6IFNlc3Npb25MaXN0SXRlbSkgPT4gKGVsZW1lbnQgYXMgSVNlc3Npb24pLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRpbmRlbnQ6IDAsXG5cdFx0XHRcdG92ZXJyaWRlU3R5bGVzOiB0aGlzLm9wdGlvbnMub3ZlcnJpZGVTdHlsZXMsXG5cdFx0XHRcdHJlbmRlckluZGVudEd1aWRlczogUmVuZGVySW5kZW50R3VpZGVzLk5vbmUsXG5cdFx0XHRcdHR3aXN0aWVBZGRpdGlvbmFsQ3NzQ2xhc3M6ICgpID0+ICdmb3JjZS1uby10d2lzdGllJyxcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZE9wZW4oZSA9PiB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50O1xuXHRcdFx0aWYgKCFlbGVtZW50IHx8ICFpc1Nlc3Npb25JdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UubWFya1JlYWQoZWxlbWVudCk7XG5cdFx0XHRjb25zdCBpc0xlZnRDbGljayA9IERPTS5pc01vdXNlRXZlbnQoZS5icm93c2VyRXZlbnQpICYmIGUuYnJvd3NlckV2ZW50LmJ1dHRvbiA9PT0gMDtcblx0XHRcdGNvbnN0IHByZXNlcnZlRm9jdXMgPSBpc0xlZnRDbGljayA/IGZhbHNlIDogKGUuZWRpdG9yT3B0aW9ucy5wcmVzZXJ2ZUZvY3VzID8/IGZhbHNlKTtcblx0XHRcdHRoaXMub3B0aW9ucy5vblNlc3Npb25PcGVuKGVsZW1lbnQucmVzb3VyY2UsIHByZXNlcnZlRm9jdXMsIGUuc2lkZUJ5U2lkZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2Vzc2lvblJlbmRlcmVyLm9uRGlkQ2hhbmdlSXRlbUhlaWdodChzZXNzaW9uID0+IHtcblx0XHRcdGlmICh0aGlzLnRyZWUuaGFzRWxlbWVudChzZXNzaW9uKSkge1xuXHRcdFx0XHR0aGlzLnRyZWUudXBkYXRlRWxlbWVudEhlaWdodChzZXNzaW9uLCB0aGlzLl9kZWxlZ2F0ZS5nZXRIZWlnaHQoc2Vzc2lvbikpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHNlc3Npb25SZW5kZXJlci5vbkRpZEFwcHJvdmVTZXNzaW9uKGFwcHJvdmVkID0+IHRoaXMuX29uRGlkQXBwcm92ZVNlc3Npb24uZmlyZShhcHByb3ZlZCkpKTtcblx0fVxuXG5cdHNldFNlc3Npb25zKHNlc3Npb25zOiByZWFkb25seSBJU2Vzc2lvbltdKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbnMgPSBzZXNzaW9ucztcblx0XHR0aGlzLnRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgc2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gKHsgZWxlbWVudDogc2Vzc2lvbiB9KSkpO1xuXHR9XG5cblx0LyoqIFRoZSB0b3RhbCBwaXhlbCBoZWlnaHQgcmVxdWlyZWQgdG8gcmVuZGVyIGFsbCBjdXJyZW50IHJvd3Mgd2l0aG91dCBzY3JvbGxpbmcuICovXG5cdGdldENvbnRlbnRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbnMucmVkdWNlKCh0b3RhbCwgc2Vzc2lvbikgPT4gdG90YWwgKyB0aGlzLl9kZWxlZ2F0ZS5nZXRIZWlnaHQoc2Vzc2lvbiksIDApO1xuXHR9XG5cblx0Z2V0Um93SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIFNlc3Npb25zRmxhdExpc3QuUk9XX0hFSUdIVDtcblx0fVxuXG5cdGxheW91dChoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuZG9tRm9jdXMoKTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLDhCQUE4QixnQ0FBZ0M7QUFDdkUsU0FBUyxlQUFlO0FBQ3hCLFNBQStCLDRCQUE0Qix3QkFBd0IsNEJBQTRCO0FBRS9HLFNBQThFLHNDQUErRTtBQUM3SixTQUFTLG9CQUFvQixvQkFBb0I7QUFDakQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBeUM7QUFDbEQsU0FBUyxZQUFZLGlCQUE4QixtQkFBbUIsb0JBQW9CO0FBQzFGLFNBQVMsc0JBQXNCO0FBQy9CLFNBQStCLFNBQVMsU0FBUywyQkFBMkIsdUJBQXVCO0FBQ25HLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsUUFBUSxjQUFjLHNCQUFzQjtBQUNyRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFzQixvQkFBb0IscUJBQXFCO0FBQy9ELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMEJBQTBCLDhCQUE4Qiw4QkFBOEIsb0JBQW9CLHNC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cUM7QUFDaEQsU0FBSyxZQUFZO0FBQ2pCLFNBQUssS0FBSyxZQUFZLE1BQU0sU0FBUyxJQUFJLGNBQVksRUFBRSxTQUFTLFFBQVEsRUFBRSxDQUFDO0FBQUEsRUFDNUU7QUFBQTtBQUFBLEVBR0EsbUJBQTJCO0FBQzFCLFdBQU8sS0FBSyxVQUFVLE9BQU8sQ0FBQyxPQUFPLFlBQVksUUFBUSxLQUFLLFVBQVUsVUFBVSxPQUFPLEdBQUcsQ0FBQztBQUFBLEVBQzlGO0FBQUEsRUFFQSxlQUF1QjtBQUN0QixXQUFPLGlCQUFpQjtBQUFBLEVBQ3pCO0FBQUEsRUFFQSxPQUFPLFFBQWdCLE9BQXFCO0FBQzNDLFNBQUssS0FBSyxPQUFPLFFBQVEsS0FBSztBQUFBLEVBQy9CO0FBQUEsRUFFQSxRQUFjO0FBQ2IsU0FBSyxLQUFLLFNBQVM7QUFBQSxFQUNwQjtBQUNEO0FBOUhhLGlCQUVZLGFBQWE7QUFGekIsbUJBQU47QUFBQSxFQWdCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F4QlU7IiwKICAibmFtZXMiOiBbIlNlc3Npb25zR3JvdXBpbmciLCAiU2Vzc2lvbnNTb3J0aW5nIiwgImNoaWxkcmVuIiwgInNlc3Npb24iLCAiZm9sZGVyIl0KfQo=
