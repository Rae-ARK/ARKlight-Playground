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
import "../media/automationsCards.css";
import "./automationsAccessibility.js";
import * as DOM from "../../../../../base/browser/dom.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { defaultButtonStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, constObservable, observableValue } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize, localize2 } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IAutomationService } from "../../../../../workbench/contrib/chat/common/automations/automationService.js";
import { CHAT_AUTOMATIONS_ENABLED_SETTING, ChatAutomationsEnabledContext } from "../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js";
import { IAutomationRunner } from "../../../../../workbench/contrib/chat/common/automations/automationRunner.js";
import { IAutomationDialogService } from "../../../../../workbench/contrib/chat/common/automations/automationDialogService.js";
import { DAYS_OF_WEEK } from "../../../../../workbench/contrib/chat/common/automations/schedule.js";
import { automationIcon } from "../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js";
import { basename } from "../../../../../base/common/resources.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { status } from "../../../../../base/browser/ui/aria/aria.js";
import { createPixelSpinner } from "../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js";
import { Gesture, EventType as TouchEventType } from "../../../../../base/browser/touch.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { URI } from "../../../../../base/common/uri.js";
import { AbstractCustomView } from "../../../../services/customView/browser/customView.js";
import { ICustomViewService } from "../../../../services/customView/browser/customViewService.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../workbench/common/contributions.js";
import { Menus } from "../../../../browser/menus.js";
import { Action2, MenuItemAction, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IActionViewItemService } from "../../../../../platform/actions/browser/actionViewItemService.js";
import { BaseActionViewItem } from "../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { AutomationsCustomViewFocusContext } from "../../../../common/contextkeys.js";
const $ = DOM.$;
let AutomationsCardsWidget = class extends Disposable {
  constructor(automationService, sessionsManagementService, instantiationService, contextKeyService) {
    super();
    this.automationService = automationService;
    this.sessionsManagementService = sessionsManagementService;
    this.isMarkingAllRead = observableValue(this, false);
    this.element = $(".automations-cards-widget");
    this.element.tabIndex = -1;
    const focusContext = AutomationsCustomViewFocusContext.bindTo(contextKeyService);
    const focusTracker = this._register(DOM.trackFocus(this.element));
    this._register(focusTracker.onDidFocus(() => focusContext.set(true)));
    this._register(focusTracker.onDidBlur(() => focusContext.set(false)));
    this._register(toDisposable(() => focusContext.reset()));
    const scrollContent = DOM.append(this.element, $(".automations-cards-scroll-content"));
    this.cardsSection = this._register(instantiationService.createInstance(AutomationCardsSection, scrollContent));
    this.historySection = this._register(instantiationService.createInstance(AutomationHistorySection, scrollContent, this.isMarkingAllRead));
    this._register(autorun((reader) => {
      const items = this.automationService.automations.read(reader);
      this.cardsSection.render(items);
    }));
    this._register(autorun((reader) => {
      if (this.isMarkingAllRead.read(reader)) {
        return;
      }
      const items = this.automationService.automations.read(reader);
      const allRuns = this.automationService.runs.read(reader);
      const sessions = /* @__PURE__ */ new Map();
      for (const run of allRuns) {
        if (!run.sessionResource) {
          continue;
        }
        const session = this.sessionsManagementService.getSession(URI.parse(run.sessionResource));
        if (session) {
          sessions.set(run.id, { isRead: session.isRead.read(reader) });
        }
      }
      this.historySection.render(allRuns, items, sessions);
    }));
  }
  layout(width, height) {
    this.element.style.width = `${width}px`;
  }
  focus() {
    this.element.focus();
  }
};
AutomationsCardsWidget = __decorateClass([
  __decorateParam(0, IAutomationService),
  __decorateParam(1, ISessionsManagementService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService)
], AutomationsCardsWidget);
let AutomationCardsSection = class extends Disposable {
  constructor(parent, automationService, automationRunner, automationDialogService, hoverService, logService, dialogService, configurationService) {
    super();
    this.automationService = automationService;
    this.automationRunner = automationRunner;
    this.automationDialogService = automationDialogService;
    this.hoverService = hoverService;
    this.logService = logService;
    this.dialogService = dialogService;
    this.configurationService = configurationService;
    this.disposables = this._register(new DisposableStore());
    this.container = DOM.append(parent, $(".automations-cards-grid"));
    this.emptyContainer = DOM.append(parent, $(".automations-cards-empty"));
    this.emptyContainer.style.display = "none";
  }
  render(automations) {
    this.disposables.clear();
    DOM.clearNode(this.container);
    if (automations.length === 0) {
      this.container.style.display = "none";
      this.emptyContainer.style.display = "";
      this.renderEmptyState();
      return;
    }
    this.container.style.display = "";
    this.emptyContainer.style.display = "none";
    for (const automation of automations) {
      this.renderCard(automation);
    }
  }
  renderCard(automation) {
    const wrapper = DOM.append(this.container, $(".automations-card-wrapper"));
    const card = DOM.append(wrapper, $(".automations-card"));
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", localize("automationCard", "{0} \u2014 {1}", automation.name, formatSchedule(automation)));
    const main = DOM.append(card, $("button.automations-card-main", {
      type: "button",
      "aria-label": localize("editAutomationNamed", "Edit automation {0}", automation.name)
    }));
    this.disposables.add(DOM.addDisposableListener(main, DOM.EventType.CLICK, () => {
      void this.openEditDialog(automation);
    }));
    const nameRow = DOM.append(main, $(".automations-card-name"));
    const nameTextEl = DOM.append(nameRow, $("span.automations-card-name-text"));
    nameTextEl.textContent = automation.name;
    if (!automation.enabled) {
      const badge = DOM.append(nameRow, $("span.automations-card-disabled-badge"));
      badge.textContent = localize("disabled", "Disabled");
    }
    const metaEl = DOM.append(main, $(".automations-card-meta"));
    const scheduleEl = DOM.append(metaEl, $("span.automations-card-meta-item"));
    scheduleEl.textContent = formatSchedule(automation);
    const folderEl = DOM.append(metaEl, $("span.automations-card-meta-item.automations-card-folder"));
    const folderLabel = automation.target.kind === "workspace" ? basename(automation.target.folderUri) : localize("quickChat", "Quick Chat");
    folderEl.textContent = folderLabel;
    this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), folderEl, folderLabel));
    const promptEl = DOM.append(main, $(".automations-card-prompt"));
    const maxLength = 120;
    promptEl.textContent = automation.prompt.length > maxLength ? automation.prompt.slice(0, maxLength) + "\u2026" : automation.prompt;
    const actions = DOM.append(card, $(".automations-card-actions"));
    actions.setAttribute("role", "group");
    actions.setAttribute("aria-label", localize("automationActions", "Actions for {0}", automation.name));
    const runBtn = this.createIconButton(actions, Codicon.play, localize("runNow", "Run now"), false);
    this.disposables.add(runBtn.onDidClick(() => {
      void this.runNow(automation);
    }));
    const deleteBtn = this.createIconButton(actions, Codicon.trash, localize("deleteAutomation", "Delete"), false);
    this.disposables.add(deleteBtn.onDidClick(() => {
      void this.confirmDelete(automation);
    }));
  }
  createIconButton(container, icon, tooltip, disabled) {
    const button = this.disposables.add(new Button(container, {
      ariaLabel: tooltip,
      disabled,
      supportIcons: true,
      title: tooltip
    }));
    button.label = `$(${icon.id})`;
    button.element.classList.add("automations-card-action-button");
    return button;
  }
  async runNow(automation) {
    if (!await this.ensureEnabled()) {
      return;
    }
    try {
      const operation = this.automationRunner.runOnce(automation, "manual", 0, CancellationToken.None);
      const dispatch = await operation.whenDispatched;
      switch (dispatch.kind) {
        case "started":
          status(localize("automationStartedStatus", "Started automation {0}", automation.name));
          break;
        case "alreadyRunning":
          status(localize("automationAlreadyRunningStatus", "Automation {0} is already running", automation.name));
          break;
        case "notStarted":
          status(localize("automationNotStartedStatus", "Automation {0} did not start", automation.name));
          break;
      }
      await operation.whenCompleted;
    } catch (error) {
      this.logService.error("[AutomationsCards] Failed to run automation", error);
      await this.dialogService.error(
        localize("automationRunActionFailed", "Failed to run automation."),
        getErrorMessage(error)
      );
    }
  }
  renderEmptyState() {
    DOM.clearNode(this.emptyContainer);
    const icon = DOM.append(this.emptyContainer, $("span.automations-cards-empty-icon"));
    icon.classList.add(...ThemeIcon.asClassNameArray(automationIcon));
    const title = DOM.append(this.emptyContainer, $("h3.automations-cards-empty-title"));
    title.textContent = localize("noAutomationsYet", "No automations yet");
    const desc = DOM.append(this.emptyContainer, $("p.automations-cards-empty-description"));
    desc.textContent = localize("noAutomationsDesc", "Create an automation to schedule an agent session to run on a cadence you choose.");
    const createButton = this.disposables.add(new Button(this.emptyContainer, {
      ...defaultButtonStyles,
      title: localize("createAutomation", "Create automation")
    }));
    createButton.label = localize("createAutomation", "Create automation");
    createButton.element.classList.add("automations-cards-create-button");
    this.disposables.add(createButton.onDidClick(() => this.openCreateDialog()));
  }
  async openCreateDialog() {
    if (!await this.ensureEnabled()) {
      return;
    }
    const result = await this.automationDialogService.showAutomationDialog({});
    if (!result || result.kind !== "create") {
      return;
    }
    if (!await this.ensureEnabled()) {
      return;
    }
    try {
      const created = await this.automationService.createAutomation(result.value, () => this.throwIfDisabled());
      status(localize("automationCreatedStatus", "Created automation {0}", created.name));
    } catch (err) {
      this.logService.error("[AutomationsCards] Failed to create automation", err);
      await this.dialogService.error(
        localize("automationCreateFailed", "Failed to create automation."),
        getErrorMessage(err)
      );
    }
  }
  async openEditDialog(automation) {
    if (!await this.ensureEnabled()) {
      return;
    }
    const result = await this.automationDialogService.showAutomationDialog({ existing: automation });
    if (!result || result.kind !== "update") {
      return;
    }
    if (!await this.ensureEnabled()) {
      return;
    }
    try {
      const updateResult = await this.automationService.updateAutomationIfUnchanged(result.id, result.value, automation, () => this.throwIfDisabled());
      if (updateResult.kind === "conflict") {
        throw new Error(updateResult.current ? localize("automationChangedDuringEdit", "This automation changed while the dialog was open. Reopen it to review the latest values.") : localize("automationDeletedDuringEdit", "This automation was deleted while the dialog was open."));
      }
      status(localize("automationUpdatedStatus", "Updated automation {0}", automation.name));
    } catch (err) {
      this.logService.error("[AutomationsCards] Failed to update automation", err);
      await this.dialogService.error(
        localize("automationUpdateFailed", "Failed to update automation."),
        getErrorMessage(err)
      );
    }
  }
  async confirmDelete(automation) {
    if (!await this.ensureEnabled()) {
      return;
    }
    const confirmed = await this.dialogService.confirm({
      message: localize("confirmDeleteAutomation", 'Delete automation "{0}"?', automation.name),
      detail: localize("confirmDeleteDetail", "This will permanently delete the automation and its run history."),
      primaryButton: localize("delete", "Delete")
    });
    if (!confirmed.confirmed) {
      return;
    }
    if (!await this.ensureEnabled()) {
      return;
    }
    try {
      await this.automationService.deleteAutomation(automation.id, () => this.throwIfDisabled());
      status(localize("automationDeletedStatus", "Deleted automation {0}", automation.name));
    } catch (err) {
      this.logService.error("[AutomationsCards] Failed to delete automation", err);
      await this.dialogService.error(
        localize("automationDeleteFailed", "Failed to delete automation."),
        getErrorMessage(err)
      );
    }
  }
  isEnabled() {
    return this.configurationService.getValue(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
  }
  async ensureEnabled() {
    if (this.isEnabled()) {
      return true;
    }
    await showAutomationsDisabled(this.dialogService);
    return false;
  }
  throwIfDisabled() {
    if (!this.isEnabled()) {
      throw new Error(localize("automationsDisabledBeforeSave", "Automations were disabled before the change could be saved."));
    }
  }
};
AutomationCardsSection = __decorateClass([
  __decorateParam(1, IAutomationService),
  __decorateParam(2, IAutomationRunner),
  __decorateParam(3, IAutomationDialogService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IDialogService),
  __decorateParam(7, IConfigurationService)
], AutomationCardsSection);
let AutomationHistorySection = class extends Disposable {
  constructor(parent, isMarkingAllRead, sessionsService, sessionsManagementService, logService, dialogService) {
    super();
    this.isMarkingAllRead = isMarkingAllRead;
    this.sessionsService = sessionsService;
    this.sessionsManagementService = sessionsManagementService;
    this.logService = logService;
    this.dialogService = dialogService;
    this.disposables = this._register(new DisposableStore());
    this.container = DOM.append(parent, $(".automations-history"));
  }
  render(runs, automations, sessions) {
    this.disposables.clear();
    DOM.clearNode(this.container);
    if (runs.length === 0) {
      this.container.style.display = "none";
      return;
    }
    this.container.style.display = "";
    const headerRow = DOM.append(this.container, $(".automations-history-header"));
    const headerLabel = DOM.append(headerRow, $("span"));
    headerLabel.textContent = localize("historyHeader", "History");
    const automationMap = new Map(automations.map((a) => [a.id, a]));
    const hasUnread = runs.some((run) => isUnreadAutomationRun(run, sessions.get(run.id)));
    if (hasUnread) {
      const markAllButton = this.disposables.add(new Button(headerRow, {
        ...defaultButtonStyles,
        secondary: true,
        title: localize("markAllRead", "Mark all as read")
      }));
      markAllButton.label = localize("markAllRead", "Mark all as read");
      markAllButton.element.classList.add("automations-mark-all-read");
      this.disposables.add(markAllButton.onDidClick(() => {
        markAllButton.enabled = false;
        void this.markAllRunsRead(runs);
      }));
    }
    const groups = groupRunsByDate(runs);
    for (const group of groups) {
      const groupEl = DOM.append(this.container, $(".automations-history-group"));
      const groupHeader = DOM.append(groupEl, $(".automations-history-group-header"));
      groupHeader.textContent = group.label;
      const groupGrid = DOM.append(groupEl, $(".automations-run-cards-grid"));
      for (const run of group.runs) {
        this.renderRunRow(groupGrid, run, automationMap, group.kind, sessions.get(run.id));
      }
    }
  }
  renderRunRow(parent, run, automationMap, bucketKind, sessionState) {
    const isUnread = isUnreadAutomationRun(run, sessionState);
    const card = DOM.append(parent, $(".automations-run-card"));
    if (isUnread) {
      card.classList.add("unread");
    }
    const automation = automationMap.get(run.automationId);
    const title = automation?.name ?? localize("unknownAutomation", "Unknown");
    const statusLabel = getRunStatusLabel(run.status);
    const timestamp = formatTimestamp(run.startedAt, bucketKind);
    const ariaLabelParts = [title];
    if (automation?.target.kind === "workspace") {
      ariaLabelParts.push(basename(automation.target.folderUri));
    }
    ariaLabelParts.push(statusLabel, timestamp);
    if (run.errorMessage) {
      ariaLabelParts.push(localize("automationRunErrorAriaLabel", "Error: {0}", run.errorMessage));
    }
    if (isUnread) {
      ariaLabelParts.push(localize("automationRunUnreadAriaLabel", "Unread"));
    }
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", ariaLabelParts.join(", "));
    const nameEl = DOM.append(card, $(".automations-run-card-name"));
    if (isUnread) {
      DOM.append(nameEl, $("span.automations-run-card-unread-dot"));
    }
    const titleSpan = DOM.append(nameEl, $("span.automations-run-card-name-title"));
    titleSpan.textContent = title;
    if (automation?.target.kind === "workspace") {
      const suffixSpan = DOM.append(nameEl, $("span.automations-run-card-name-workspace"));
      suffixSpan.textContent = ` \xB7 ${basename(automation.target.folderUri)}`;
    }
    const statusRow = DOM.append(card, $(".automations-run-card-status-row"));
    if (run.status === "running" || run.status === "pending") {
      const spinnerContainer = DOM.append(statusRow, $("span.automations-run-card-icon"));
      spinnerContainer.setAttribute("aria-hidden", "true");
      this.disposables.add(createPixelSpinner(spinnerContainer, { variant: "grid" }));
    } else {
      const statusInfo = runStatusIcon(run.status);
      const iconEl = DOM.append(statusRow, $("span.automations-run-card-icon.codicon"));
      iconEl.classList.add(`codicon-${statusInfo.iconId}`);
      iconEl.setAttribute("aria-hidden", "true");
    }
    const timeEl = DOM.append(statusRow, $("span.automations-run-card-time"));
    timeEl.textContent = timestamp;
    if (run.errorMessage) {
      DOM.append(statusRow, $(".meta-sep")).textContent = "\xB7";
      const errorEl = DOM.append(statusRow, $("span.automations-run-card-error"));
      errorEl.textContent = run.errorMessage;
    }
    if (run.sessionResource && sessionState) {
      card.classList.add("clickable");
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      this.disposables.add(Gesture.addTarget(card));
      const activate = () => this.openRunSession(run);
      for (const eventType of [DOM.EventType.CLICK, TouchEventType.Tap]) {
        this.disposables.add(DOM.addDisposableListener(card, eventType, () => {
          void activate();
        }));
      }
      this.disposables.add(DOM.addDisposableListener(card, DOM.EventType.KEY_DOWN, (event) => {
        if ((event.key === "Enter" || event.key === " ") && event.target === card) {
          event.preventDefault();
          void activate();
        }
      }));
    }
  }
  async openRunSession(run) {
    if (!run.sessionResource) {
      return;
    }
    const resource = URI.parse(run.sessionResource);
    if (!this.sessionsManagementService.getSession(resource)) {
      return;
    }
    try {
      await this.sessionsService.openSession(resource, { preserveFocus: false });
    } catch (error) {
      this.logService.error("[AutomationsCards] Failed to open automation run", error);
      await this.dialogService.error(
        localize("automationRunOpenFailed", "Failed to open automation run."),
        getErrorMessage(error)
      );
    }
  }
  async markAllRunsRead(runs) {
    this.isMarkingAllRead.set(true, void 0);
    const sessions = /* @__PURE__ */ new Map();
    try {
      for (const run of runs) {
        if ((run.status === "completed" || run.status === "failed") && run.sessionResource) {
          const session = this.sessionsManagementService.getSession(URI.parse(run.sessionResource));
          if (session && !session.isRead.get()) {
            sessions.set(session.resource.toString(), session);
          }
        }
      }
      await this.sessionsManagementService.markAllRead([...sessions.values()]);
    } catch (error) {
      this.logService.error("[AutomationsCards] Failed to mark automation runs read", error);
      await this.dialogService.error(
        localize("automationMarkAllReadFailed", "Failed to mark automation runs as read."),
        getErrorMessage(error)
      );
    } finally {
      this.isMarkingAllRead.set(false, void 0);
    }
  }
};
AutomationHistorySection = __decorateClass([
  __decorateParam(2, ISessionsService),
  __decorateParam(3, ISessionsManagementService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IDialogService)
], AutomationHistorySection);
function isUnreadAutomationRun(run, sessionState) {
  return (run.status === "completed" || run.status === "failed") && !!sessionState && !sessionState.isRead;
}
function formatSchedule(automation) {
  const { interval, scheduleHour, scheduleMinute } = automation.schedule;
  const time = formatHourMinute(scheduleHour, scheduleMinute);
  switch (interval) {
    case "hourly":
      return localize("scheduleHourly", "Hourly");
    case "daily":
      return localize("scheduleDailyAt", "Daily at {0}", time);
    case "weekly": {
      const day = DAYS_OF_WEEK[(automation.schedule.scheduleDay % 7 + 7) % 7];
      return localize("scheduleWeeklyAt", "{0} at {1}", day, time);
    }
    case "manual":
      return localize("scheduleManual", "Manual");
    default:
      return localize("scheduleManual", "Manual");
  }
}
function formatHourMinute(hour, minute) {
  const date = new Date(Date.UTC(2e3, 0, 1, Math.max(0, Math.min(23, hour | 0)), Math.max(0, Math.min(59, minute | 0))));
  return date.toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}
function groupRunsByDate(runs) {
  const now = /* @__PURE__ */ new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeekStart = new Date(today);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const groups = /* @__PURE__ */ new Map();
  for (const run of runs) {
    const t = Date.parse(run.startedAt);
    if (Number.isNaN(t)) {
      continue;
    }
    const date = new Date(t);
    const { label, kind, order } = getDateBucket(date, today, yesterday, lastWeekStart);
    let group = groups.get(label);
    if (!group) {
      group = { label, kind, order, runs: [] };
      groups.set(label, group);
    }
    group.runs.push(run);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order);
}
function getDateBucket(date, today, yesterday, lastWeekStart) {
  if (date >= today) {
    return { label: localize("today", "Today"), kind: "today", order: 0 };
  }
  if (date >= yesterday) {
    return { label: localize("yesterday", "Yesterday"), kind: "yesterday", order: 1 };
  }
  if (date >= lastWeekStart) {
    return { label: localize("lastWeek", "Last week"), kind: "week", order: 2 };
  }
  const monthLabel = date.toLocaleDateString(void 0, { month: "long", year: "numeric" });
  const monthIndex = date.getFullYear() * 12 + date.getMonth();
  const order = 3e4 - monthIndex;
  return { label: monthLabel, kind: "month", order };
}
function runStatusIcon(s) {
  switch (s) {
    case "pending":
      return { iconId: "circle-outline", spin: false };
    case "running":
      return { iconId: "sync", spin: true };
    case "completed":
      return { iconId: "check", spin: false };
    case "failed":
      return { iconId: "error", spin: false };
  }
}
function getRunStatusLabel(status2) {
  switch (status2) {
    case "pending":
      return localize("automationRunPending", "Pending");
    case "running":
      return localize("automationRunRunning", "Running");
    case "completed":
      return localize("automationRunCompleted", "Completed");
    case "failed":
      return localize("automationRunFailed", "Failed");
  }
}
function formatTimestamp(iso, kind) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    return iso;
  }
  const date = new Date(t);
  const time = date.toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit" });
  switch (kind) {
    case "today":
    case "yesterday":
      return time;
    case "week":
      return `${date.toLocaleDateString(void 0, { weekday: "short" })} ${time}`;
    case "month":
      return `${date.toLocaleDateString(void 0, { month: "short", day: "numeric" })} ${time}`;
  }
}
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
async function showAutomationsDisabled(dialogService) {
  await dialogService.info(
    localize("automationsDisabledTitle", "Automations are disabled."),
    localize("automationsDisabledDetail", "Enable \u201C{0}\u201D to make changes.", CHAT_AUTOMATIONS_ENABLED_SETTING)
  );
}
const AUTOMATIONS_CUSTOM_VIEW_ID = "sessions.customView.automations";
let AutomationsCustomView = class extends AbstractCustomView {
  constructor(instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this.title = constObservable(localize("automationsTitle", "Automations"));
    this.description = constObservable(
      localize("automationsDescription", "Schedule agent sessions to run automatically on a cadence you choose.")
    );
  }
  render(container) {
    this._widget = this._register(this.instantiationService.createInstance(AutomationsCardsWidget));
    container.appendChild(this._widget.element);
  }
  layout(width, height) {
    this._widget?.layout(width, height);
  }
  focus() {
    this._widget?.focus();
  }
};
AutomationsCustomView = __decorateClass([
  __decorateParam(0, IInstantiationService)
], AutomationsCustomView);
let AutomationsCustomViewContribution = class extends Disposable {
  constructor(customViewService, actionViewItemService, contextKeyService) {
    super();
    this._register(customViewService.registerCustomView({
      id: AUTOMATIONS_CUSTOM_VIEW_ID,
      ctor: new SyncDescriptor(AutomationsCustomView),
      actions: { style: "buttonBar", menuId: Menus.CustomViewAutomations }
    }));
    const automationContextKeys = /* @__PURE__ */ new Set([ChatAutomationsEnabledContext.key]);
    this._register(contextKeyService.onDidChangeContext((event) => {
      if (event.affectsSome(automationContextKeys) && !contextKeyService.getContextKeyValue(ChatAutomationsEnabledContext.key) && customViewService.activeCustomView.get()?.id === AUTOMATIONS_CUSTOM_VIEW_ID) {
        customViewService.hideCustomView();
      }
    }));
    this._register(actionViewItemService.register(Menus.CustomViewAutomations, "sessionsView.newAutomation", (action, options, instantiationService) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(PrimaryButtonActionViewItem, void 0, action, options);
    }));
  }
};
AutomationsCustomViewContribution.ID = "sessions.contrib.automationsCustomView";
AutomationsCustomViewContribution = __decorateClass([
  __decorateParam(0, ICustomViewService),
  __decorateParam(1, IActionViewItemService),
  __decorateParam(2, IContextKeyService)
], AutomationsCustomViewContribution);
registerWorkbenchContribution2(AutomationsCustomViewContribution.ID, AutomationsCustomViewContribution, WorkbenchPhase.BlockRestore);
class PrimaryButtonActionViewItem extends BaseActionViewItem {
  constructor(context, action, options) {
    super(context, action, options);
  }
  render(container) {
    this.element = container;
    container.classList.add("chat-composite-bar-meta-item");
    const button = this.button = this._register(new Button(container, { secondary: false, ...defaultButtonStyles }));
    button.element.classList.add("monaco-text-button", "chat-composite-bar-meta-item-button");
    this._register(button.onDidClick(() => {
      if (this._action.enabled) {
        this.actionRunner.run(this._action, this._context);
      }
    }));
    this.updateLabel();
    this.updateEnabled();
  }
  focus() {
    this.button?.focus();
  }
  blur() {
    if (this.button) {
      this.button.element.tabIndex = -1;
      this.button.element.blur();
    }
  }
  setFocusable(focusable) {
    if (this.button) {
      this.button.element.tabIndex = focusable ? 0 : -1;
    }
  }
  updateEnabled() {
    if (this.button) {
      this.button.enabled = this._action.enabled;
    }
  }
  updateLabel() {
    if (!this.button) {
      return;
    }
    DOM.reset(this.button.element, this._action.label);
  }
}
registerAction2(class NewAutomationAction extends Action2 {
  constructor() {
    super({
      id: "sessionsView.newAutomation",
      title: localize2("newAutomation", "New Automation"),
      precondition: ChatAutomationsEnabledContext,
      menu: [{ id: Menus.CustomViewAutomations, group: "navigation", order: 1, when: ChatAutomationsEnabledContext }]
    });
  }
  async run(accessor) {
    const automationDialogService = accessor.get(IAutomationDialogService);
    const automationService = accessor.get(IAutomationService);
    const configurationService = accessor.get(IConfigurationService);
    const dialogService = accessor.get(IDialogService);
    const logService = accessor.get(ILogService);
    const isEnabled = () => configurationService.getValue(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
    if (!isEnabled()) {
      await showAutomationsDisabled(dialogService);
      return;
    }
    const result = await automationDialogService.showAutomationDialog({});
    if (!result || result.kind !== "create") {
      return;
    }
    if (!isEnabled()) {
      await showAutomationsDisabled(dialogService);
      return;
    }
    try {
      await automationService.createAutomation(result.value, () => {
        if (!isEnabled()) {
          throw new Error(localize("automationsDisabledBeforeSave", "Automations were disabled before the change could be saved."));
        }
      });
    } catch (err) {
      logService.error("[Automations] Failed to create automation", err);
      await dialogService.error(
        localize("automationCreateFailed", "Failed to create automation."),
        getErrorMessage(err)
      );
    }
  }
});
export {
  AUTOMATIONS_CUSTOM_VIEW_ID,
  AutomationsCardsWidget,
  AutomationsCustomView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvYnJvd3Nlci92aWV3cy9hdXRvbWF0aW9uc1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4uL21lZGlhL2F1dG9tYXRpb25zQ2FyZHMuY3NzJztcbmltcG9ydCAnLi9hdXRvbWF0aW9uc0FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB0eXBlIHsgSUF1dG9tYXRpb24sIElBdXRvbWF0aW9uUnVuLCBBdXRvbWF0aW9uUnVuU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbi5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDSEFUX0FVVE9NQVRJT05TX0VOQUJMRURfU0VUVElORywgQ2hhdEF1dG9tYXRpb25zRW5hYmxlZENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uc0VuYWJsZWQuanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRpb25SdW5uZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uUnVubmVyLmpzJztcbmltcG9ydCB7IElBdXRvbWF0aW9uRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERBWVNfT0ZfV0VFSyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL3NjaGVkdWxlLmpzJztcbmltcG9ydCB7IGF1dG9tYXRpb25JY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25JY29ucy5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgc3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVQaXhlbFNwaW5uZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcGl4ZWxTcGlubmVyL3BpeGVsU3Bpbm5lci5qcyc7XG5pbXBvcnQgeyBHZXN0dXJlLCBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbmltcG9ydCB7IEFic3RyYWN0Q3VzdG9tVmlldyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2N1c3RvbVZpZXcvYnJvd3Nlci9jdXN0b21WaWV3LmpzJztcbmltcG9ydCB7IElDdXN0b21WaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2N1c3RvbVZpZXcvYnJvd3Nlci9jdXN0b21WaWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgTWVudXMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL21lbnVzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJdGVtQWN0aW9uLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSwgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEF1dG9tYXRpb25zQ3VzdG9tVmlld0ZvY3VzQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuLyoqXG4gKiBDYXJkLXN0eWxlIHZpZXcgb2YgYXV0b21hdGlvbnMgZm9yIHRoZSBBZ2VudHMgd2luZG93IHNlc3Npb25zIGdyaWQuXG4gKiBVc2VzIG5hdGl2ZSBWUyBDb2RlIGNvbXBvbmVudHMgYW5kIHN0eWxpbmcgcGF0dGVybnMgbWF0Y2hpbmcgdGhlXG4gKiBhdXRvbWF0aW9uc0xpc3RXaWRnZXQgaW4gQUkgQ3VzdG9taXphdGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIEF1dG9tYXRpb25zQ2FyZHNXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNhcmRzU2VjdGlvbjogQXV0b21hdGlvbkNhcmRzU2VjdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBoaXN0b3J5U2VjdGlvbjogQXV0b21hdGlvbkhpc3RvcnlTZWN0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IGlzTWFya2luZ0FsbFJlYWQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQXV0b21hdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRvbWF0aW9uU2VydmljZTogSUF1dG9tYXRpb25TZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmVsZW1lbnQgPSAkKCcuYXV0b21hdGlvbnMtY2FyZHMtd2lkZ2V0Jyk7XG5cdFx0dGhpcy5lbGVtZW50LnRhYkluZGV4ID0gLTE7XG5cdFx0Y29uc3QgZm9jdXNDb250ZXh0ID0gQXV0b21hdGlvbnNDdXN0b21WaWV3Rm9jdXNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgZm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIoRE9NLnRyYWNrRm9jdXModGhpcy5lbGVtZW50KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoKCkgPT4gZm9jdXNDb250ZXh0LnNldCh0cnVlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4gZm9jdXNDb250ZXh0LnNldChmYWxzZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gZm9jdXNDb250ZXh0LnJlc2V0KCkpKTtcblx0XHRjb25zdCBzY3JvbGxDb250ZW50ID0gRE9NLmFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5hdXRvbWF0aW9ucy1jYXJkcy1zY3JvbGwtY29udGVudCcpKTtcblxuXHRcdHRoaXMuY2FyZHNTZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQXV0b21hdGlvbkNhcmRzU2VjdGlvbiwgc2Nyb2xsQ29udGVudCkpO1xuXHRcdHRoaXMuaGlzdG9yeVNlY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBdXRvbWF0aW9uSGlzdG9yeVNlY3Rpb24sIHNjcm9sbENvbnRlbnQsIHRoaXMuaXNNYXJraW5nQWxsUmVhZCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLmF1dG9tYXRpb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuY2FyZHNTZWN0aW9uLnJlbmRlcihpdGVtcyk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNNYXJraW5nQWxsUmVhZC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaXRlbXMgPSB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLmF1dG9tYXRpb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGFsbFJ1bnMgPSB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLnJ1bnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgSUF1dG9tYXRpb25SdW5TZXNzaW9uU3RhdGU+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IHJ1biBvZiBhbGxSdW5zKSB7XG5cdFx0XHRcdGlmICghcnVuLnNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbihVUkkucGFyc2UocnVuLnNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHRcdHNlc3Npb25zLnNldChydW4uaWQsIHsgaXNSZWFkOiBzZXNzaW9uLmlzUmVhZC5yZWFkKHJlYWRlcikgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuaGlzdG9yeVNlY3Rpb24ucmVuZGVyKGFsbFJ1bnMsIGl0ZW1zLCBzZXNzaW9ucyk7XG5cdFx0fSkpO1xuXHR9XG5cblx0bGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50LmZvY3VzKCk7XG5cdH1cbn1cblxuLy8jcmVnaW9uIEF1dG9tYXRpb25DYXJkc1NlY3Rpb25cblxuLyoqXG4gKiBSZW5kZXJzIHRoZSBhdXRvbWF0aW9uIGNhcmQgZ3JpZCBhbmQgZW1wdHkgc3RhdGUuXG4gKi9cbmNsYXNzIEF1dG9tYXRpb25DYXJkc1NlY3Rpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZW1wdHlDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdEBJQXV0b21hdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRvbWF0aW9uU2VydmljZTogSUF1dG9tYXRpb25TZXJ2aWNlLFxuXHRcdEBJQXV0b21hdGlvblJ1bm5lciBwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25SdW5uZXI6IElBdXRvbWF0aW9uUnVubmVyLFxuXHRcdEBJQXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRvbWF0aW9uRGlhbG9nU2VydmljZTogSUF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuY29udGFpbmVyID0gRE9NLmFwcGVuZChwYXJlbnQsICQoJy5hdXRvbWF0aW9ucy1jYXJkcy1ncmlkJykpO1xuXHRcdHRoaXMuZW1wdHlDb250YWluZXIgPSBET00uYXBwZW5kKHBhcmVudCwgJCgnLmF1dG9tYXRpb25zLWNhcmRzLWVtcHR5JykpO1xuXHRcdHRoaXMuZW1wdHlDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0fVxuXG5cdHJlbmRlcihhdXRvbWF0aW9uczogcmVhZG9ubHkgSUF1dG9tYXRpb25bXSk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuY29udGFpbmVyKTtcblxuXHRcdGlmIChhdXRvbWF0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLmVtcHR5Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdHRoaXMucmVuZGVyRW1wdHlTdGF0ZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR0aGlzLmVtcHR5Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHRmb3IgKGNvbnN0IGF1dG9tYXRpb24gb2YgYXV0b21hdGlvbnMpIHtcblx0XHRcdHRoaXMucmVuZGVyQ2FyZChhdXRvbWF0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNhcmQoYXV0b21hdGlvbjogSUF1dG9tYXRpb24pOiB2b2lkIHtcblx0XHRjb25zdCB3cmFwcGVyID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnLmF1dG9tYXRpb25zLWNhcmQtd3JhcHBlcicpKTtcblx0XHRjb25zdCBjYXJkID0gRE9NLmFwcGVuZCh3cmFwcGVyLCAkKCcuYXV0b21hdGlvbnMtY2FyZCcpKTtcblx0XHRjYXJkLnNldEF0dHJpYnV0ZSgncm9sZScsICdncm91cCcpO1xuXHRcdGNhcmQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2F1dG9tYXRpb25DYXJkJywgXCJ7MH0gXHUyMDE0IHsxfVwiLCBhdXRvbWF0aW9uLm5hbWUsIGZvcm1hdFNjaGVkdWxlKGF1dG9tYXRpb24pKSk7XG5cblx0XHRjb25zdCBtYWluID0gRE9NLmFwcGVuZChjYXJkLCAkKCdidXR0b24uYXV0b21hdGlvbnMtY2FyZC1tYWluJywge1xuXHRcdFx0dHlwZTogJ2J1dHRvbicsXG5cdFx0XHQnYXJpYS1sYWJlbCc6IGxvY2FsaXplKCdlZGl0QXV0b21hdGlvbk5hbWVkJywgXCJFZGl0IGF1dG9tYXRpb24gezB9XCIsIGF1dG9tYXRpb24ubmFtZSksXG5cdFx0fSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobWFpbiwgRE9NLkV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0dm9pZCB0aGlzLm9wZW5FZGl0RGlhbG9nKGF1dG9tYXRpb24pO1xuXHRcdH0pKTtcblxuXHRcdC8vIE5hbWUgcm93IHdpdGggZGlzYWJsZWQgYmFkZ2Vcblx0XHRjb25zdCBuYW1lUm93ID0gRE9NLmFwcGVuZChtYWluLCAkKCcuYXV0b21hdGlvbnMtY2FyZC1uYW1lJykpO1xuXHRcdGNvbnN0IG5hbWVUZXh0RWwgPSBET00uYXBwZW5kKG5hbWVSb3csICQoJ3NwYW4uYXV0b21hdGlvbnMtY2FyZC1uYW1lLXRleHQnKSk7XG5cdFx0bmFtZVRleHRFbC50ZXh0Q29udGVudCA9IGF1dG9tYXRpb24ubmFtZTtcblxuXHRcdGlmICghYXV0b21hdGlvbi5lbmFibGVkKSB7XG5cdFx0XHRjb25zdCBiYWRnZSA9IERPTS5hcHBlbmQobmFtZVJvdywgJCgnc3Bhbi5hdXRvbWF0aW9ucy1jYXJkLWRpc2FibGVkLWJhZGdlJykpO1xuXHRcdFx0YmFkZ2UudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZGlzYWJsZWQnLCBcIkRpc2FibGVkXCIpO1xuXHRcdH1cblxuXHRcdC8vIE1ldGFkYXRhIHJvdyAoc2NoZWR1bGUgXHUwMEI3IGZvbGRlciBcdTAwQjcgbGFzdCBydW4pXG5cdFx0Y29uc3QgbWV0YUVsID0gRE9NLmFwcGVuZChtYWluLCAkKCcuYXV0b21hdGlvbnMtY2FyZC1tZXRhJykpO1xuXHRcdGNvbnN0IHNjaGVkdWxlRWwgPSBET00uYXBwZW5kKG1ldGFFbCwgJCgnc3Bhbi5hdXRvbWF0aW9ucy1jYXJkLW1ldGEtaXRlbScpKTtcblx0XHRzY2hlZHVsZUVsLnRleHRDb250ZW50ID0gZm9ybWF0U2NoZWR1bGUoYXV0b21hdGlvbik7XG5cblx0XHRjb25zdCBmb2xkZXJFbCA9IERPTS5hcHBlbmQobWV0YUVsLCAkKCdzcGFuLmF1dG9tYXRpb25zLWNhcmQtbWV0YS1pdGVtLmF1dG9tYXRpb25zLWNhcmQtZm9sZGVyJykpO1xuXHRcdGNvbnN0IGZvbGRlckxhYmVsID0gYXV0b21hdGlvbi50YXJnZXQua2luZCA9PT0gJ3dvcmtzcGFjZScgPyBiYXNlbmFtZShhdXRvbWF0aW9uLnRhcmdldC5mb2xkZXJVcmkpIDogbG9jYWxpemUoJ3F1aWNrQ2hhdCcsIFwiUXVpY2sgQ2hhdFwiKTtcblx0XHRmb2xkZXJFbC50ZXh0Q29udGVudCA9IGZvbGRlckxhYmVsO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIGZvbGRlckVsLCBmb2xkZXJMYWJlbCkpO1xuXG5cdFx0Ly8gUHJvbXB0IHByZXZpZXcgKHRydW5jYXRlZClcblx0XHRjb25zdCBwcm9tcHRFbCA9IERPTS5hcHBlbmQobWFpbiwgJCgnLmF1dG9tYXRpb25zLWNhcmQtcHJvbXB0JykpO1xuXHRcdGNvbnN0IG1heExlbmd0aCA9IDEyMDtcblx0XHRwcm9tcHRFbC50ZXh0Q29udGVudCA9IGF1dG9tYXRpb24ucHJvbXB0Lmxlbmd0aCA+IG1heExlbmd0aFxuXHRcdFx0PyBhdXRvbWF0aW9uLnByb21wdC5zbGljZSgwLCBtYXhMZW5ndGgpICsgJ1x1MjAyNidcblx0XHRcdDogYXV0b21hdGlvbi5wcm9tcHQ7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gRE9NLmFwcGVuZChjYXJkLCAkKCcuYXV0b21hdGlvbnMtY2FyZC1hY3Rpb25zJykpO1xuXHRcdGFjdGlvbnMuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2dyb3VwJyk7XG5cdFx0YWN0aW9ucy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnYXV0b21hdGlvbkFjdGlvbnMnLCBcIkFjdGlvbnMgZm9yIHswfVwiLCBhdXRvbWF0aW9uLm5hbWUpKTtcblx0XHRjb25zdCBydW5CdG4gPSB0aGlzLmNyZWF0ZUljb25CdXR0b24oYWN0aW9ucywgQ29kaWNvbi5wbGF5LCBsb2NhbGl6ZSgncnVuTm93JywgXCJSdW4gbm93XCIpLCBmYWxzZSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQocnVuQnRuLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dm9pZCB0aGlzLnJ1bk5vdyhhdXRvbWF0aW9uKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkZWxldGVCdG4gPSB0aGlzLmNyZWF0ZUljb25CdXR0b24oYWN0aW9ucywgQ29kaWNvbi50cmFzaCwgbG9jYWxpemUoJ2RlbGV0ZUF1dG9tYXRpb24nLCBcIkRlbGV0ZVwiKSwgZmFsc2UpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGRlbGV0ZUJ0bi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHZvaWQgdGhpcy5jb25maXJtRGVsZXRlKGF1dG9tYXRpb24pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlSWNvbkJ1dHRvbihjb250YWluZXI6IEhUTUxFbGVtZW50LCBpY29uOiBUaGVtZUljb24sIHRvb2x0aXA6IHN0cmluZywgZGlzYWJsZWQ6IGJvb2xlYW4pOiBCdXR0b24ge1xuXHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oY29udGFpbmVyLCB7XG5cdFx0XHRhcmlhTGFiZWw6IHRvb2x0aXAsXG5cdFx0XHRkaXNhYmxlZCxcblx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSxcblx0XHRcdHRpdGxlOiB0b29sdGlwLFxuXHRcdH0pKTtcblx0XHRidXR0b24ubGFiZWwgPSBgJCgke2ljb24uaWR9KWA7XG5cdFx0YnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnYXV0b21hdGlvbnMtY2FyZC1hY3Rpb24tYnV0dG9uJyk7XG5cdFx0cmV0dXJuIGJ1dHRvbjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcnVuTm93KGF1dG9tYXRpb246IElBdXRvbWF0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFhd2FpdCB0aGlzLmVuc3VyZUVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgb3BlcmF0aW9uID0gdGhpcy5hdXRvbWF0aW9uUnVubmVyLnJ1bk9uY2UoYXV0b21hdGlvbiwgJ21hbnVhbCcsIDAsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgZGlzcGF0Y2ggPSBhd2FpdCBvcGVyYXRpb24ud2hlbkRpc3BhdGNoZWQ7XG5cdFx0XHRzd2l0Y2ggKGRpc3BhdGNoLmtpbmQpIHtcblx0XHRcdFx0Y2FzZSAnc3RhcnRlZCc6XG5cdFx0XHRcdFx0c3RhdHVzKGxvY2FsaXplKCdhdXRvbWF0aW9uU3RhcnRlZFN0YXR1cycsIFwiU3RhcnRlZCBhdXRvbWF0aW9uIHswfVwiLCBhdXRvbWF0aW9uLm5hbWUpKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnYWxyZWFkeVJ1bm5pbmcnOlxuXHRcdFx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgnYXV0b21hdGlvbkFscmVhZHlSdW5uaW5nU3RhdHVzJywgXCJBdXRvbWF0aW9uIHswfSBpcyBhbHJlYWR5IHJ1bm5pbmdcIiwgYXV0b21hdGlvbi5uYW1lKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ25vdFN0YXJ0ZWQnOlxuXHRcdFx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgnYXV0b21hdGlvbk5vdFN0YXJ0ZWRTdGF0dXMnLCBcIkF1dG9tYXRpb24gezB9IGRpZCBub3Qgc3RhcnRcIiwgYXV0b21hdGlvbi5uYW1lKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBvcGVyYXRpb24ud2hlbkNvbXBsZXRlZDtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbQXV0b21hdGlvbnNDYXJkc10gRmFpbGVkIHRvIHJ1biBhdXRvbWF0aW9uJywgZXJyb3IpO1xuXHRcdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmVycm9yKFxuXHRcdFx0XHRsb2NhbGl6ZSgnYXV0b21hdGlvblJ1bkFjdGlvbkZhaWxlZCcsIFwiRmFpbGVkIHRvIHJ1biBhdXRvbWF0aW9uLlwiKSxcblx0XHRcdFx0Z2V0RXJyb3JNZXNzYWdlKGVycm9yKSxcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJFbXB0eVN0YXRlKCk6IHZvaWQge1xuXHRcdERPTS5jbGVhck5vZGUodGhpcy5lbXB0eUNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBpY29uID0gRE9NLmFwcGVuZCh0aGlzLmVtcHR5Q29udGFpbmVyLCAkKCdzcGFuLmF1dG9tYXRpb25zLWNhcmRzLWVtcHR5LWljb24nKSk7XG5cdFx0aWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGF1dG9tYXRpb25JY29uKSk7XG5cdFx0Y29uc3QgdGl0bGUgPSBET00uYXBwZW5kKHRoaXMuZW1wdHlDb250YWluZXIsICQoJ2gzLmF1dG9tYXRpb25zLWNhcmRzLWVtcHR5LXRpdGxlJykpO1xuXHRcdHRpdGxlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vQXV0b21hdGlvbnNZZXQnLCBcIk5vIGF1dG9tYXRpb25zIHlldFwiKTtcblx0XHRjb25zdCBkZXNjID0gRE9NLmFwcGVuZCh0aGlzLmVtcHR5Q29udGFpbmVyLCAkKCdwLmF1dG9tYXRpb25zLWNhcmRzLWVtcHR5LWRlc2NyaXB0aW9uJykpO1xuXHRcdGRlc2MudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9BdXRvbWF0aW9uc0Rlc2MnLCBcIkNyZWF0ZSBhbiBhdXRvbWF0aW9uIHRvIHNjaGVkdWxlIGFuIGFnZW50IHNlc3Npb24gdG8gcnVuIG9uIGEgY2FkZW5jZSB5b3UgY2hvb3NlLlwiKTtcblxuXHRcdGNvbnN0IGNyZWF0ZUJ1dHRvbiA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24odGhpcy5lbXB0eUNvbnRhaW5lciwge1xuXHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlcyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY3JlYXRlQXV0b21hdGlvbicsIFwiQ3JlYXRlIGF1dG9tYXRpb25cIiksXG5cdFx0fSkpO1xuXHRcdGNyZWF0ZUJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdjcmVhdGVBdXRvbWF0aW9uJywgXCJDcmVhdGUgYXV0b21hdGlvblwiKTtcblx0XHRjcmVhdGVCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdhdXRvbWF0aW9ucy1jYXJkcy1jcmVhdGUtYnV0dG9uJyk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoY3JlYXRlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5vcGVuQ3JlYXRlRGlhbG9nKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkNyZWF0ZURpYWxvZygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWF3YWl0IHRoaXMuZW5zdXJlRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuYXV0b21hdGlvbkRpYWxvZ1NlcnZpY2Uuc2hvd0F1dG9tYXRpb25EaWFsb2coe30pO1xuXHRcdGlmICghcmVzdWx0IHx8IHJlc3VsdC5raW5kICE9PSAnY3JlYXRlJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIWF3YWl0IHRoaXMuZW5zdXJlRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjcmVhdGVkID0gYXdhaXQgdGhpcy5hdXRvbWF0aW9uU2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHJlc3VsdC52YWx1ZSwgKCkgPT4gdGhpcy50aHJvd0lmRGlzYWJsZWQoKSk7XG5cdFx0XHRzdGF0dXMobG9jYWxpemUoJ2F1dG9tYXRpb25DcmVhdGVkU3RhdHVzJywgXCJDcmVhdGVkIGF1dG9tYXRpb24gezB9XCIsIGNyZWF0ZWQubmFtZSkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbQXV0b21hdGlvbnNDYXJkc10gRmFpbGVkIHRvIGNyZWF0ZSBhdXRvbWF0aW9uJywgZXJyKTtcblx0XHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5lcnJvcihcblx0XHRcdFx0bG9jYWxpemUoJ2F1dG9tYXRpb25DcmVhdGVGYWlsZWQnLCBcIkZhaWxlZCB0byBjcmVhdGUgYXV0b21hdGlvbi5cIiksXG5cdFx0XHRcdGdldEVycm9yTWVzc2FnZShlcnIpLFxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5FZGl0RGlhbG9nKGF1dG9tYXRpb246IElBdXRvbWF0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFhd2FpdCB0aGlzLmVuc3VyZUVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLnNob3dBdXRvbWF0aW9uRGlhbG9nKHsgZXhpc3Rpbmc6IGF1dG9tYXRpb24gfSk7XG5cdFx0aWYgKCFyZXN1bHQgfHwgcmVzdWx0LmtpbmQgIT09ICd1cGRhdGUnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghYXdhaXQgdGhpcy5lbnN1cmVFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHVwZGF0ZVJlc3VsdCA9IGF3YWl0IHRoaXMuYXV0b21hdGlvblNlcnZpY2UudXBkYXRlQXV0b21hdGlvbklmVW5jaGFuZ2VkKHJlc3VsdC5pZCwgcmVzdWx0LnZhbHVlLCBhdXRvbWF0aW9uLCAoKSA9PiB0aGlzLnRocm93SWZEaXNhYmxlZCgpKTtcblx0XHRcdGlmICh1cGRhdGVSZXN1bHQua2luZCA9PT0gJ2NvbmZsaWN0Jykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IodXBkYXRlUmVzdWx0LmN1cnJlbnRcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhdXRvbWF0aW9uQ2hhbmdlZER1cmluZ0VkaXQnLCBcIlRoaXMgYXV0b21hdGlvbiBjaGFuZ2VkIHdoaWxlIHRoZSBkaWFsb2cgd2FzIG9wZW4uIFJlb3BlbiBpdCB0byByZXZpZXcgdGhlIGxhdGVzdCB2YWx1ZXMuXCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnYXV0b21hdGlvbkRlbGV0ZWREdXJpbmdFZGl0JywgXCJUaGlzIGF1dG9tYXRpb24gd2FzIGRlbGV0ZWQgd2hpbGUgdGhlIGRpYWxvZyB3YXMgb3Blbi5cIikpO1xuXHRcdFx0fVxuXHRcdFx0c3RhdHVzKGxvY2FsaXplKCdhdXRvbWF0aW9uVXBkYXRlZFN0YXR1cycsIFwiVXBkYXRlZCBhdXRvbWF0aW9uIHswfVwiLCBhdXRvbWF0aW9uLm5hbWUpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0F1dG9tYXRpb25zQ2FyZHNdIEZhaWxlZCB0byB1cGRhdGUgYXV0b21hdGlvbicsIGVycik7XG5cdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuZXJyb3IoXG5cdFx0XHRcdGxvY2FsaXplKCdhdXRvbWF0aW9uVXBkYXRlRmFpbGVkJywgXCJGYWlsZWQgdG8gdXBkYXRlIGF1dG9tYXRpb24uXCIpLFxuXHRcdFx0XHRnZXRFcnJvck1lc3NhZ2UoZXJyKSxcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb25maXJtRGVsZXRlKGF1dG9tYXRpb246IElBdXRvbWF0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFhd2FpdCB0aGlzLmVuc3VyZUVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29uZmlybURlbGV0ZUF1dG9tYXRpb24nLCBcIkRlbGV0ZSBhdXRvbWF0aW9uIFxcXCJ7MH1cXFwiP1wiLCBhdXRvbWF0aW9uLm5hbWUpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY29uZmlybURlbGV0ZURldGFpbCcsIFwiVGhpcyB3aWxsIHBlcm1hbmVudGx5IGRlbGV0ZSB0aGUgYXV0b21hdGlvbiBhbmQgaXRzIHJ1biBoaXN0b3J5LlwiKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdkZWxldGUnLCBcIkRlbGV0ZVwiKSxcblx0XHR9KTtcblx0XHRpZiAoIWNvbmZpcm1lZC5jb25maXJtZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFhd2FpdCB0aGlzLmVuc3VyZUVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5hdXRvbWF0aW9uU2VydmljZS5kZWxldGVBdXRvbWF0aW9uKGF1dG9tYXRpb24uaWQsICgpID0+IHRoaXMudGhyb3dJZkRpc2FibGVkKCkpO1xuXHRcdFx0c3RhdHVzKGxvY2FsaXplKCdhdXRvbWF0aW9uRGVsZXRlZFN0YXR1cycsIFwiRGVsZXRlZCBhdXRvbWF0aW9uIHswfVwiLCBhdXRvbWF0aW9uLm5hbWUpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0F1dG9tYXRpb25zQ2FyZHNdIEZhaWxlZCB0byBkZWxldGUgYXV0b21hdGlvbicsIGVycik7XG5cdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuZXJyb3IoXG5cdFx0XHRcdGxvY2FsaXplKCdhdXRvbWF0aW9uRGVsZXRlRmFpbGVkJywgXCJGYWlsZWQgdG8gZGVsZXRlIGF1dG9tYXRpb24uXCIpLFxuXHRcdFx0XHRnZXRFcnJvck1lc3NhZ2UoZXJyKSxcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpc0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ0hBVF9BVVRPTUFUSU9OU19FTkFCTEVEX1NFVFRJTkcpID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBlbnN1cmVFbmFibGVkKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0YXdhaXQgc2hvd0F1dG9tYXRpb25zRGlzYWJsZWQodGhpcy5kaWFsb2dTZXJ2aWNlKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHRocm93SWZEaXNhYmxlZCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNFbmFibGVkKCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnYXV0b21hdGlvbnNEaXNhYmxlZEJlZm9yZVNhdmUnLCBcIkF1dG9tYXRpb25zIHdlcmUgZGlzYWJsZWQgYmVmb3JlIHRoZSBjaGFuZ2UgY291bGQgYmUgc2F2ZWQuXCIpKTtcblx0XHR9XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBBdXRvbWF0aW9uSGlzdG9yeVNlY3Rpb25cblxuLyoqXG4gKiBSZW5kZXJzIHRoZSBydW4gaGlzdG9yeSBsaXN0IGdyb3VwZWQgYnkgZGF0ZS5cbiAqL1xuY2xhc3MgQXV0b21hdGlvbkhpc3RvcnlTZWN0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaXNNYXJraW5nQWxsUmVhZDogSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPixcblx0XHRASVNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmNvbnRhaW5lciA9IERPTS5hcHBlbmQocGFyZW50LCAkKCcuYXV0b21hdGlvbnMtaGlzdG9yeScpKTtcblx0fVxuXG5cdHJlbmRlcihydW5zOiByZWFkb25seSBJQXV0b21hdGlvblJ1bltdLCBhdXRvbWF0aW9uczogcmVhZG9ubHkgSUF1dG9tYXRpb25bXSwgc2Vzc2lvbnM6IFJlYWRvbmx5TWFwPHN0cmluZywgSUF1dG9tYXRpb25SdW5TZXNzaW9uU3RhdGU+KTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdERPTS5jbGVhck5vZGUodGhpcy5jb250YWluZXIpO1xuXG5cdFx0aWYgKHJ1bnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblxuXHRcdGNvbnN0IGhlYWRlclJvdyA9IERPTS5hcHBlbmQodGhpcy5jb250YWluZXIsICQoJy5hdXRvbWF0aW9ucy1oaXN0b3J5LWhlYWRlcicpKTtcblx0XHRjb25zdCBoZWFkZXJMYWJlbCA9IERPTS5hcHBlbmQoaGVhZGVyUm93LCAkKCdzcGFuJykpO1xuXHRcdGhlYWRlckxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2hpc3RvcnlIZWFkZXInLCBcIkhpc3RvcnlcIik7XG5cblx0XHRjb25zdCBhdXRvbWF0aW9uTWFwID0gbmV3IE1hcChhdXRvbWF0aW9ucy5tYXAoYSA9PiBbYS5pZCwgYV0pKTtcblx0XHRjb25zdCBoYXNVbnJlYWQgPSBydW5zLnNvbWUocnVuID0+IGlzVW5yZWFkQXV0b21hdGlvblJ1bihydW4sIHNlc3Npb25zLmdldChydW4uaWQpKSk7XG5cdFx0aWYgKGhhc1VucmVhZCkge1xuXHRcdFx0Y29uc3QgbWFya0FsbEJ1dHRvbiA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oaGVhZGVyUm93LCB7XG5cdFx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsXG5cdFx0XHRcdHNlY29uZGFyeTogdHJ1ZSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtYXJrQWxsUmVhZCcsIFwiTWFyayBhbGwgYXMgcmVhZFwiKSxcblx0XHRcdH0pKTtcblx0XHRcdG1hcmtBbGxCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnbWFya0FsbFJlYWQnLCBcIk1hcmsgYWxsIGFzIHJlYWRcIik7XG5cdFx0XHRtYXJrQWxsQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnYXV0b21hdGlvbnMtbWFyay1hbGwtcmVhZCcpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQobWFya0FsbEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdFx0bWFya0FsbEJ1dHRvbi5lbmFibGVkID0gZmFsc2U7XG5cdFx0XHRcdHZvaWQgdGhpcy5tYXJrQWxsUnVuc1JlYWQocnVucyk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ3JvdXBzID0gZ3JvdXBSdW5zQnlEYXRlKHJ1bnMpO1xuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRcdGNvbnN0IGdyb3VwRWwgPSBET00uYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCcuYXV0b21hdGlvbnMtaGlzdG9yeS1ncm91cCcpKTtcblx0XHRcdGNvbnN0IGdyb3VwSGVhZGVyID0gRE9NLmFwcGVuZChncm91cEVsLCAkKCcuYXV0b21hdGlvbnMtaGlzdG9yeS1ncm91cC1oZWFkZXInKSk7XG5cdFx0XHRncm91cEhlYWRlci50ZXh0Q29udGVudCA9IGdyb3VwLmxhYmVsO1xuXG5cdFx0XHRjb25zdCBncm91cEdyaWQgPSBET00uYXBwZW5kKGdyb3VwRWwsICQoJy5hdXRvbWF0aW9ucy1ydW4tY2FyZHMtZ3JpZCcpKTtcblx0XHRcdGZvciAoY29uc3QgcnVuIG9mIGdyb3VwLnJ1bnMpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJSdW5Sb3coZ3JvdXBHcmlkLCBydW4sIGF1dG9tYXRpb25NYXAsIGdyb3VwLmtpbmQsIHNlc3Npb25zLmdldChydW4uaWQpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclJ1blJvdyhwYXJlbnQ6IEhUTUxFbGVtZW50LCBydW46IElBdXRvbWF0aW9uUnVuLCBhdXRvbWF0aW9uTWFwOiBNYXA8c3RyaW5nLCBJQXV0b21hdGlvbj4sIGJ1Y2tldEtpbmQ6IERhdGVCdWNrZXRLaW5kLCBzZXNzaW9uU3RhdGU6IElBdXRvbWF0aW9uUnVuU2Vzc2lvblN0YXRlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNVbnJlYWQgPSBpc1VucmVhZEF1dG9tYXRpb25SdW4ocnVuLCBzZXNzaW9uU3RhdGUpO1xuXHRcdGNvbnN0IGNhcmQgPSBET00uYXBwZW5kKHBhcmVudCwgJCgnLmF1dG9tYXRpb25zLXJ1bi1jYXJkJykpO1xuXHRcdGlmIChpc1VucmVhZCkge1xuXHRcdFx0Y2FyZC5jbGFzc0xpc3QuYWRkKCd1bnJlYWQnKTtcblx0XHR9XG5cblx0XHRjb25zdCBhdXRvbWF0aW9uID0gYXV0b21hdGlvbk1hcC5nZXQocnVuLmF1dG9tYXRpb25JZCk7XG5cdFx0Y29uc3QgdGl0bGUgPSBhdXRvbWF0aW9uPy5uYW1lID8/IGxvY2FsaXplKCd1bmtub3duQXV0b21hdGlvbicsIFwiVW5rbm93blwiKTtcblx0XHRjb25zdCBzdGF0dXNMYWJlbCA9IGdldFJ1blN0YXR1c0xhYmVsKHJ1bi5zdGF0dXMpO1xuXHRcdGNvbnN0IHRpbWVzdGFtcCA9IGZvcm1hdFRpbWVzdGFtcChydW4uc3RhcnRlZEF0LCBidWNrZXRLaW5kKTtcblx0XHRjb25zdCBhcmlhTGFiZWxQYXJ0cyA9IFt0aXRsZV07XG5cdFx0aWYgKGF1dG9tYXRpb24/LnRhcmdldC5raW5kID09PSAnd29ya3NwYWNlJykge1xuXHRcdFx0YXJpYUxhYmVsUGFydHMucHVzaChiYXNlbmFtZShhdXRvbWF0aW9uLnRhcmdldC5mb2xkZXJVcmkpKTtcblx0XHR9XG5cdFx0YXJpYUxhYmVsUGFydHMucHVzaChzdGF0dXNMYWJlbCwgdGltZXN0YW1wKTtcblx0XHRpZiAocnVuLmVycm9yTWVzc2FnZSkge1xuXHRcdFx0YXJpYUxhYmVsUGFydHMucHVzaChsb2NhbGl6ZSgnYXV0b21hdGlvblJ1bkVycm9yQXJpYUxhYmVsJywgXCJFcnJvcjogezB9XCIsIHJ1bi5lcnJvck1lc3NhZ2UpKTtcblx0XHR9XG5cdFx0aWYgKGlzVW5yZWFkKSB7XG5cdFx0XHRhcmlhTGFiZWxQYXJ0cy5wdXNoKGxvY2FsaXplKCdhdXRvbWF0aW9uUnVuVW5yZWFkQXJpYUxhYmVsJywgXCJVbnJlYWRcIikpO1xuXHRcdH1cblx0XHRjYXJkLnNldEF0dHJpYnV0ZSgncm9sZScsICdncm91cCcpO1xuXHRcdGNhcmQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYXJpYUxhYmVsUGFydHMuam9pbignLCAnKSk7XG5cblx0XHRjb25zdCBuYW1lRWwgPSBET00uYXBwZW5kKGNhcmQsICQoJy5hdXRvbWF0aW9ucy1ydW4tY2FyZC1uYW1lJykpO1xuXHRcdGlmIChpc1VucmVhZCkge1xuXHRcdFx0RE9NLmFwcGVuZChuYW1lRWwsICQoJ3NwYW4uYXV0b21hdGlvbnMtcnVuLWNhcmQtdW5yZWFkLWRvdCcpKTtcblx0XHR9XG5cdFx0Y29uc3QgdGl0bGVTcGFuID0gRE9NLmFwcGVuZChuYW1lRWwsICQoJ3NwYW4uYXV0b21hdGlvbnMtcnVuLWNhcmQtbmFtZS10aXRsZScpKTtcblx0XHR0aXRsZVNwYW4udGV4dENvbnRlbnQgPSB0aXRsZTtcblx0XHRpZiAoYXV0b21hdGlvbj8udGFyZ2V0LmtpbmQgPT09ICd3b3Jrc3BhY2UnKSB7XG5cdFx0XHRjb25zdCBzdWZmaXhTcGFuID0gRE9NLmFwcGVuZChuYW1lRWwsICQoJ3NwYW4uYXV0b21hdGlvbnMtcnVuLWNhcmQtbmFtZS13b3Jrc3BhY2UnKSk7XG5cdFx0XHRzdWZmaXhTcGFuLnRleHRDb250ZW50ID0gYCBcXHUwMEI3ICR7YmFzZW5hbWUoYXV0b21hdGlvbi50YXJnZXQuZm9sZGVyVXJpKX1gO1xuXHRcdH1cblxuXHRcdC8vIFN0YXR1cyBpY29uICsgdGltZXN0YW1wICsgZXJyb3IgKHNpbmdsZSByb3cpXG5cdFx0Y29uc3Qgc3RhdHVzUm93ID0gRE9NLmFwcGVuZChjYXJkLCAkKCcuYXV0b21hdGlvbnMtcnVuLWNhcmQtc3RhdHVzLXJvdycpKTtcblxuXHRcdGlmIChydW4uc3RhdHVzID09PSAncnVubmluZycgfHwgcnVuLnN0YXR1cyA9PT0gJ3BlbmRpbmcnKSB7XG5cdFx0XHRjb25zdCBzcGlubmVyQ29udGFpbmVyID0gRE9NLmFwcGVuZChzdGF0dXNSb3csICQoJ3NwYW4uYXV0b21hdGlvbnMtcnVuLWNhcmQtaWNvbicpKTtcblx0XHRcdHNwaW5uZXJDb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChjcmVhdGVQaXhlbFNwaW5uZXIoc3Bpbm5lckNvbnRhaW5lciwgeyB2YXJpYW50OiAnZ3JpZCcgfSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzdGF0dXNJbmZvID0gcnVuU3RhdHVzSWNvbihydW4uc3RhdHVzKTtcblx0XHRcdGNvbnN0IGljb25FbCA9IERPTS5hcHBlbmQoc3RhdHVzUm93LCAkKCdzcGFuLmF1dG9tYXRpb25zLXJ1bi1jYXJkLWljb24uY29kaWNvbicpKTtcblx0XHRcdGljb25FbC5jbGFzc0xpc3QuYWRkKGBjb2RpY29uLSR7c3RhdHVzSW5mby5pY29uSWR9YCk7XG5cdFx0XHRpY29uRWwuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGltZUVsID0gRE9NLmFwcGVuZChzdGF0dXNSb3csICQoJ3NwYW4uYXV0b21hdGlvbnMtcnVuLWNhcmQtdGltZScpKTtcblx0XHR0aW1lRWwudGV4dENvbnRlbnQgPSB0aW1lc3RhbXA7XG5cblx0XHRpZiAocnVuLmVycm9yTWVzc2FnZSkge1xuXHRcdFx0RE9NLmFwcGVuZChzdGF0dXNSb3csICQoJy5tZXRhLXNlcCcpKS50ZXh0Q29udGVudCA9ICdcXHUwMEI3Jztcblx0XHRcdGNvbnN0IGVycm9yRWwgPSBET00uYXBwZW5kKHN0YXR1c1JvdywgJCgnc3Bhbi5hdXRvbWF0aW9ucy1ydW4tY2FyZC1lcnJvcicpKTtcblx0XHRcdGVycm9yRWwudGV4dENvbnRlbnQgPSBydW4uZXJyb3JNZXNzYWdlO1xuXHRcdH1cblxuXHRcdGlmIChydW4uc2Vzc2lvblJlc291cmNlICYmIHNlc3Npb25TdGF0ZSkge1xuXHRcdFx0Y2FyZC5jbGFzc0xpc3QuYWRkKCdjbGlja2FibGUnKTtcblx0XHRcdGNhcmQuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0XHRjYXJkLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKEdlc3R1cmUuYWRkVGFyZ2V0KGNhcmQpKTtcblx0XHRcdGNvbnN0IGFjdGl2YXRlID0gKCkgPT4gdGhpcy5vcGVuUnVuU2Vzc2lvbihydW4pO1xuXHRcdFx0Zm9yIChjb25zdCBldmVudFR5cGUgb2YgW0RPTS5FdmVudFR5cGUuQ0xJQ0ssIFRvdWNoRXZlbnRUeXBlLlRhcF0pIHtcblx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjYXJkLCBldmVudFR5cGUsICgpID0+IHtcblx0XHRcdFx0XHR2b2lkIGFjdGl2YXRlKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoY2FyZCwgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgZXZlbnQgPT4ge1xuXHRcdFx0XHRpZiAoKGV2ZW50LmtleSA9PT0gJ0VudGVyJyB8fCBldmVudC5rZXkgPT09ICcgJykgJiYgZXZlbnQudGFyZ2V0ID09PSBjYXJkKSB7XG5cdFx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHR2b2lkIGFjdGl2YXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5SdW5TZXNzaW9uKHJ1bjogSUF1dG9tYXRpb25SdW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXJ1bi5zZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UocnVuLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCF0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbihyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuc2Vzc2lvbnNTZXJ2aWNlLm9wZW5TZXNzaW9uKHJlc291cmNlLCB7IHByZXNlcnZlRm9jdXM6IGZhbHNlIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tBdXRvbWF0aW9uc0NhcmRzXSBGYWlsZWQgdG8gb3BlbiBhdXRvbWF0aW9uIHJ1bicsIGVycm9yKTtcblx0XHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5lcnJvcihcblx0XHRcdFx0bG9jYWxpemUoJ2F1dG9tYXRpb25SdW5PcGVuRmFpbGVkJywgXCJGYWlsZWQgdG8gb3BlbiBhdXRvbWF0aW9uIHJ1bi5cIiksXG5cdFx0XHRcdGdldEVycm9yTWVzc2FnZShlcnJvciksXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbWFya0FsbFJ1bnNSZWFkKHJ1bnM6IHJlYWRvbmx5IElBdXRvbWF0aW9uUnVuW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmlzTWFya2luZ0FsbFJlYWQuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgSVNlc3Npb24+KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGZvciAoY29uc3QgcnVuIG9mIHJ1bnMpIHtcblx0XHRcdFx0aWYgKChydW4uc3RhdHVzID09PSAnY29tcGxldGVkJyB8fCBydW4uc3RhdHVzID09PSAnZmFpbGVkJykgJiYgcnVuLnNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbihVUkkucGFyc2UocnVuLnNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdFx0XHRcdGlmIChzZXNzaW9uICYmICFzZXNzaW9uLmlzUmVhZC5nZXQoKSkge1xuXHRcdFx0XHRcdFx0c2Vzc2lvbnMuc2V0KHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSwgc2Vzc2lvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UubWFya0FsbFJlYWQoWy4uLnNlc3Npb25zLnZhbHVlcygpXSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0F1dG9tYXRpb25zQ2FyZHNdIEZhaWxlZCB0byBtYXJrIGF1dG9tYXRpb24gcnVucyByZWFkJywgZXJyb3IpO1xuXHRcdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmVycm9yKFxuXHRcdFx0XHRsb2NhbGl6ZSgnYXV0b21hdGlvbk1hcmtBbGxSZWFkRmFpbGVkJywgXCJGYWlsZWQgdG8gbWFyayBhdXRvbWF0aW9uIHJ1bnMgYXMgcmVhZC5cIiksXG5cdFx0XHRcdGdldEVycm9yTWVzc2FnZShlcnJvciksXG5cdFx0XHQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLmlzTWFya2luZ0FsbFJlYWQuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIEhlbHBlcnNcblxudHlwZSBEYXRlQnVja2V0S2luZCA9ICd0b2RheScgfCAneWVzdGVyZGF5JyB8ICd3ZWVrJyB8ICdtb250aCc7XG5cbmludGVyZmFjZSBJQXV0b21hdGlvblJ1blNlc3Npb25TdGF0ZSB7XG5cdHJlYWRvbmx5IGlzUmVhZDogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gaXNVbnJlYWRBdXRvbWF0aW9uUnVuKHJ1bjogSUF1dG9tYXRpb25SdW4sIHNlc3Npb25TdGF0ZTogSUF1dG9tYXRpb25SdW5TZXNzaW9uU3RhdGUgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIChydW4uc3RhdHVzID09PSAnY29tcGxldGVkJyB8fCBydW4uc3RhdHVzID09PSAnZmFpbGVkJykgJiYgISFzZXNzaW9uU3RhdGUgJiYgIXNlc3Npb25TdGF0ZS5pc1JlYWQ7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdFNjaGVkdWxlKGF1dG9tYXRpb246IElBdXRvbWF0aW9uKTogc3RyaW5nIHtcblx0Y29uc3QgeyBpbnRlcnZhbCwgc2NoZWR1bGVIb3VyLCBzY2hlZHVsZU1pbnV0ZSB9ID0gYXV0b21hdGlvbi5zY2hlZHVsZTtcblx0Y29uc3QgdGltZSA9IGZvcm1hdEhvdXJNaW51dGUoc2NoZWR1bGVIb3VyLCBzY2hlZHVsZU1pbnV0ZSk7XG5cdHN3aXRjaCAoaW50ZXJ2YWwpIHtcblx0XHRjYXNlICdob3VybHknOiByZXR1cm4gbG9jYWxpemUoJ3NjaGVkdWxlSG91cmx5JywgXCJIb3VybHlcIik7XG5cdFx0Y2FzZSAnZGFpbHknOiByZXR1cm4gbG9jYWxpemUoJ3NjaGVkdWxlRGFpbHlBdCcsIFwiRGFpbHkgYXQgezB9XCIsIHRpbWUpO1xuXHRcdGNhc2UgJ3dlZWtseSc6IHtcblx0XHRcdGNvbnN0IGRheSA9IERBWVNfT0ZfV0VFS1soKGF1dG9tYXRpb24uc2NoZWR1bGUuc2NoZWR1bGVEYXkgJSA3KSArIDcpICUgN107XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NjaGVkdWxlV2Vla2x5QXQnLCBcInswfSBhdCB7MX1cIiwgZGF5LCB0aW1lKTtcblx0XHR9XG5cdFx0Y2FzZSAnbWFudWFsJzogcmV0dXJuIGxvY2FsaXplKCdzY2hlZHVsZU1hbnVhbCcsIFwiTWFudWFsXCIpO1xuXHRcdGRlZmF1bHQ6IHJldHVybiBsb2NhbGl6ZSgnc2NoZWR1bGVNYW51YWwnLCBcIk1hbnVhbFwiKTtcblx0fVxufVxuXG5mdW5jdGlvbiBmb3JtYXRIb3VyTWludXRlKGhvdXI6IG51bWJlciwgbWludXRlOiBudW1iZXIpOiBzdHJpbmcge1xuXHRjb25zdCBkYXRlID0gbmV3IERhdGUoRGF0ZS5VVEMoMjAwMCwgMCwgMSwgTWF0aC5tYXgoMCwgTWF0aC5taW4oMjMsIGhvdXIgfCAwKSksIE1hdGgubWF4KDAsIE1hdGgubWluKDU5LCBtaW51dGUgfCAwKSkpKTtcblx0cmV0dXJuIGRhdGUudG9Mb2NhbGVUaW1lU3RyaW5nKHVuZGVmaW5lZCwgeyBob3VyOiAnbnVtZXJpYycsIG1pbnV0ZTogJzItZGlnaXQnLCB0aW1lWm9uZTogJ1VUQycgfSk7XG59XG5cbmZ1bmN0aW9uIGdyb3VwUnVuc0J5RGF0ZShydW5zOiByZWFkb25seSBJQXV0b21hdGlvblJ1bltdKTogeyBsYWJlbDogc3RyaW5nOyBraW5kOiBEYXRlQnVja2V0S2luZDsgcnVuczogSUF1dG9tYXRpb25SdW5bXSB9W10ge1xuXHRjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuXHRjb25zdCB0b2RheSA9IG5ldyBEYXRlKG5vdy5nZXRGdWxsWWVhcigpLCBub3cuZ2V0TW9udGgoKSwgbm93LmdldERhdGUoKSk7XG5cdGNvbnN0IHllc3RlcmRheSA9IG5ldyBEYXRlKHRvZGF5KTtcblx0eWVzdGVyZGF5LnNldERhdGUoeWVzdGVyZGF5LmdldERhdGUoKSAtIDEpO1xuXHRjb25zdCBsYXN0V2Vla1N0YXJ0ID0gbmV3IERhdGUodG9kYXkpO1xuXHRsYXN0V2Vla1N0YXJ0LnNldERhdGUobGFzdFdlZWtTdGFydC5nZXREYXRlKCkgLSA3KTtcblxuXHRjb25zdCBncm91cHM6IE1hcDxzdHJpbmcsIHsgbGFiZWw6IHN0cmluZzsga2luZDogRGF0ZUJ1Y2tldEtpbmQ7IG9yZGVyOiBudW1iZXI7IHJ1bnM6IElBdXRvbWF0aW9uUnVuW10gfT4gPSBuZXcgTWFwKCk7XG5cblx0Zm9yIChjb25zdCBydW4gb2YgcnVucykge1xuXHRcdGNvbnN0IHQgPSBEYXRlLnBhcnNlKHJ1bi5zdGFydGVkQXQpO1xuXHRcdGlmIChOdW1iZXIuaXNOYU4odCkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBkYXRlID0gbmV3IERhdGUodCk7XG5cdFx0Y29uc3QgeyBsYWJlbCwga2luZCwgb3JkZXIgfSA9IGdldERhdGVCdWNrZXQoZGF0ZSwgdG9kYXksIHllc3RlcmRheSwgbGFzdFdlZWtTdGFydCk7XG5cblx0XHRsZXQgZ3JvdXAgPSBncm91cHMuZ2V0KGxhYmVsKTtcblx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRncm91cCA9IHsgbGFiZWwsIGtpbmQsIG9yZGVyLCBydW5zOiBbXSB9O1xuXHRcdFx0Z3JvdXBzLnNldChsYWJlbCwgZ3JvdXApO1xuXHRcdH1cblx0XHRncm91cC5ydW5zLnB1c2gocnVuKTtcblx0fVxuXG5cdHJldHVybiBbLi4uZ3JvdXBzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLm9yZGVyIC0gYi5vcmRlcik7XG59XG5cbmZ1bmN0aW9uIGdldERhdGVCdWNrZXQoZGF0ZTogRGF0ZSwgdG9kYXk6IERhdGUsIHllc3RlcmRheTogRGF0ZSwgbGFzdFdlZWtTdGFydDogRGF0ZSk6IHsgbGFiZWw6IHN0cmluZzsga2luZDogRGF0ZUJ1Y2tldEtpbmQ7IG9yZGVyOiBudW1iZXIgfSB7XG5cdGlmIChkYXRlID49IHRvZGF5KSB7XG5cdFx0cmV0dXJuIHsgbGFiZWw6IGxvY2FsaXplKCd0b2RheScsIFwiVG9kYXlcIiksIGtpbmQ6ICd0b2RheScsIG9yZGVyOiAwIH07XG5cdH1cblx0aWYgKGRhdGUgPj0geWVzdGVyZGF5KSB7XG5cdFx0cmV0dXJuIHsgbGFiZWw6IGxvY2FsaXplKCd5ZXN0ZXJkYXknLCBcIlllc3RlcmRheVwiKSwga2luZDogJ3llc3RlcmRheScsIG9yZGVyOiAxIH07XG5cdH1cblx0aWYgKGRhdGUgPj0gbGFzdFdlZWtTdGFydCkge1xuXHRcdHJldHVybiB7IGxhYmVsOiBsb2NhbGl6ZSgnbGFzdFdlZWsnLCBcIkxhc3Qgd2Vla1wiKSwga2luZDogJ3dlZWsnLCBvcmRlcjogMiB9O1xuXHR9XG5cdGNvbnN0IG1vbnRoTGFiZWwgPSBkYXRlLnRvTG9jYWxlRGF0ZVN0cmluZyh1bmRlZmluZWQsIHsgbW9udGg6ICdsb25nJywgeWVhcjogJ251bWVyaWMnIH0pO1xuXHRjb25zdCBtb250aEluZGV4ID0gZGF0ZS5nZXRGdWxsWWVhcigpICogMTIgKyBkYXRlLmdldE1vbnRoKCk7XG5cdGNvbnN0IG9yZGVyID0gMzAwMDAgLSBtb250aEluZGV4O1xuXHRyZXR1cm4geyBsYWJlbDogbW9udGhMYWJlbCwga2luZDogJ21vbnRoJywgb3JkZXIgfTtcbn1cblxuZnVuY3Rpb24gcnVuU3RhdHVzSWNvbihzOiBBdXRvbWF0aW9uUnVuU3RhdHVzKTogeyBpY29uSWQ6IHN0cmluZzsgc3BpbjogYm9vbGVhbiB9IHtcblx0c3dpdGNoIChzKSB7XG5cdFx0Y2FzZSAncGVuZGluZyc6IHJldHVybiB7IGljb25JZDogJ2NpcmNsZS1vdXRsaW5lJywgc3BpbjogZmFsc2UgfTtcblx0XHRjYXNlICdydW5uaW5nJzogcmV0dXJuIHsgaWNvbklkOiAnc3luYycsIHNwaW46IHRydWUgfTtcblx0XHRjYXNlICdjb21wbGV0ZWQnOiByZXR1cm4geyBpY29uSWQ6ICdjaGVjaycsIHNwaW46IGZhbHNlIH07XG5cdFx0Y2FzZSAnZmFpbGVkJzogcmV0dXJuIHsgaWNvbklkOiAnZXJyb3InLCBzcGluOiBmYWxzZSB9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFJ1blN0YXR1c0xhYmVsKHN0YXR1czogQXV0b21hdGlvblJ1blN0YXR1cyk6IHN0cmluZyB7XG5cdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0Y2FzZSAncGVuZGluZyc6IHJldHVybiBsb2NhbGl6ZSgnYXV0b21hdGlvblJ1blBlbmRpbmcnLCBcIlBlbmRpbmdcIik7XG5cdFx0Y2FzZSAncnVubmluZyc6IHJldHVybiBsb2NhbGl6ZSgnYXV0b21hdGlvblJ1blJ1bm5pbmcnLCBcIlJ1bm5pbmdcIik7XG5cdFx0Y2FzZSAnY29tcGxldGVkJzogcmV0dXJuIGxvY2FsaXplKCdhdXRvbWF0aW9uUnVuQ29tcGxldGVkJywgXCJDb21wbGV0ZWRcIik7XG5cdFx0Y2FzZSAnZmFpbGVkJzogcmV0dXJuIGxvY2FsaXplKCdhdXRvbWF0aW9uUnVuRmFpbGVkJywgXCJGYWlsZWRcIik7XG5cdH1cbn1cblxuZnVuY3Rpb24gZm9ybWF0VGltZXN0YW1wKGlzbzogc3RyaW5nLCBraW5kOiBEYXRlQnVja2V0S2luZCk6IHN0cmluZyB7XG5cdGNvbnN0IHQgPSBEYXRlLnBhcnNlKGlzbyk7XG5cdGlmIChOdW1iZXIuaXNOYU4odCkpIHtcblx0XHRyZXR1cm4gaXNvO1xuXHR9XG5cdGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSh0KTtcblx0Y29uc3QgdGltZSA9IGRhdGUudG9Mb2NhbGVUaW1lU3RyaW5nKHVuZGVmaW5lZCwgeyBob3VyOiAnbnVtZXJpYycsIG1pbnV0ZTogJzItZGlnaXQnIH0pO1xuXG5cdHN3aXRjaCAoa2luZCkge1xuXHRcdGNhc2UgJ3RvZGF5Jzpcblx0XHRjYXNlICd5ZXN0ZXJkYXknOlxuXHRcdFx0cmV0dXJuIHRpbWU7XG5cdFx0Y2FzZSAnd2Vlayc6XG5cdFx0XHRyZXR1cm4gYCR7ZGF0ZS50b0xvY2FsZURhdGVTdHJpbmcodW5kZWZpbmVkLCB7IHdlZWtkYXk6ICdzaG9ydCcgfSl9ICR7dGltZX1gO1xuXHRcdGNhc2UgJ21vbnRoJzpcblx0XHRcdHJldHVybiBgJHtkYXRlLnRvTG9jYWxlRGF0ZVN0cmluZyh1bmRlZmluZWQsIHsgbW9udGg6ICdzaG9ydCcsIGRheTogJ251bWVyaWMnIH0pfSAke3RpbWV9YDtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRFcnJvck1lc3NhZ2UoZXJyb3I6IHVua25vd24pOiBzdHJpbmcge1xuXHRyZXR1cm4gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzaG93QXV0b21hdGlvbnNEaXNhYmxlZChkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRhd2FpdCBkaWFsb2dTZXJ2aWNlLmluZm8oXG5cdFx0bG9jYWxpemUoJ2F1dG9tYXRpb25zRGlzYWJsZWRUaXRsZScsIFwiQXV0b21hdGlvbnMgYXJlIGRpc2FibGVkLlwiKSxcblx0XHRsb2NhbGl6ZSgnYXV0b21hdGlvbnNEaXNhYmxlZERldGFpbCcsIFwiRW5hYmxlIFxcdTIwMUN7MH1cXHUyMDFEIHRvIG1ha2UgY2hhbmdlcy5cIiwgQ0hBVF9BVVRPTUFUSU9OU19FTkFCTEVEX1NFVFRJTkcpLFxuXHQpO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIEF1dG9tYXRpb25zVmlldyAoQ3VzdG9tIFZpZXcpXG5cbmV4cG9ydCBjb25zdCBBVVRPTUFUSU9OU19DVVNUT01fVklFV19JRCA9ICdzZXNzaW9ucy5jdXN0b21WaWV3LmF1dG9tYXRpb25zJztcblxuLyoqXG4gKiBBIGN1c3RvbSB2aWV3IHRoYXQgaG9zdHMgdGhlIGF1dG9tYXRpb25zIG1hbmFnZW1lbnQgcGFnZSBpbnNpZGUgdGhlXG4gKiBhZ2VudHMgd2luZG93LCB1c2luZyB0aGUgQ3VzdG9tVmlld0dyaWRQYXJ0IGluZnJhc3RydWN0dXJlLlxuICovXG5leHBvcnQgY2xhc3MgQXV0b21hdGlvbnNDdXN0b21WaWV3IGV4dGVuZHMgQWJzdHJhY3RDdXN0b21WaWV3IHtcblxuXHRyZWFkb25seSB0aXRsZTogSU9ic2VydmFibGU8c3RyaW5nPiA9IGNvbnN0T2JzZXJ2YWJsZShsb2NhbGl6ZSgnYXV0b21hdGlvbnNUaXRsZScsIFwiQXV0b21hdGlvbnNcIikpO1xuXHRvdmVycmlkZSByZWFkb25seSBkZXNjcmlwdGlvbjogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPiA9IGNvbnN0T2JzZXJ2YWJsZShcblx0XHRsb2NhbGl6ZSgnYXV0b21hdGlvbnNEZXNjcmlwdGlvbicsIFwiU2NoZWR1bGUgYWdlbnQgc2Vzc2lvbnMgdG8gcnVuIGF1dG9tYXRpY2FsbHkgb24gYSBjYWRlbmNlIHlvdSBjaG9vc2UuXCIpKTtcblxuXHRwcml2YXRlIF93aWRnZXQ6IEF1dG9tYXRpb25zQ2FyZHNXaWRnZXQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBdXRvbWF0aW9uc0NhcmRzV2lkZ2V0KSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3dpZGdldC5lbGVtZW50KTtcblx0fVxuXG5cdGxheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3dpZGdldD8ubGF5b3V0KHdpZHRoLCBoZWlnaHQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0Py5mb2N1cygpO1xuXHR9XG59XG5cbi8qKlxuICogUmVnaXN0ZXJzIHRoZSBBdXRvbWF0aW9ucyBjdXN0b20gdmlldyB3aXRoIHRoZSBjdXN0b20gdmlldyBzZXJ2aWNlLlxuICovXG5jbGFzcyBBdXRvbWF0aW9uc0N1c3RvbVZpZXdDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnc2Vzc2lvbnMuY29udHJpYi5hdXRvbWF0aW9uc0N1c3RvbVZpZXcnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ3VzdG9tVmlld1NlcnZpY2UgY3VzdG9tVmlld1NlcnZpY2U6IElDdXN0b21WaWV3U2VydmljZSxcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY3VzdG9tVmlld1NlcnZpY2UucmVnaXN0ZXJDdXN0b21WaWV3KHtcblx0XHRcdGlkOiBBVVRPTUFUSU9OU19DVVNUT01fVklFV19JRCxcblx0XHRcdGN0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihBdXRvbWF0aW9uc0N1c3RvbVZpZXcpLFxuXHRcdFx0YWN0aW9uczogeyBzdHlsZTogJ2J1dHRvbkJhcicsIG1lbnVJZDogTWVudXMuQ3VzdG9tVmlld0F1dG9tYXRpb25zIH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYXV0b21hdGlvbkNvbnRleHRLZXlzID0gbmV3IFNldChbQ2hhdEF1dG9tYXRpb25zRW5hYmxlZENvbnRleHQua2V5XSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5hZmZlY3RzU29tZShhdXRvbWF0aW9uQ29udGV4dEtleXMpXG5cdFx0XHRcdCYmICFjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oQ2hhdEF1dG9tYXRpb25zRW5hYmxlZENvbnRleHQua2V5KVxuXHRcdFx0XHQmJiBjdXN0b21WaWV3U2VydmljZS5hY3RpdmVDdXN0b21WaWV3LmdldCgpPy5pZCA9PT0gQVVUT01BVElPTlNfQ1VTVE9NX1ZJRVdfSUQpIHtcblx0XHRcdFx0Y3VzdG9tVmlld1NlcnZpY2UuaGlkZUN1c3RvbVZpZXcoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZW5kZXIgdGhlIFwiTmV3IEF1dG9tYXRpb25cIiBidXR0b24gYXMgcHJpbWFyeSBpbnN0ZWFkIG9mIHNlY29uZGFyeVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihNZW51cy5DdXN0b21WaWV3QXV0b21hdGlvbnMsICdzZXNzaW9uc1ZpZXcubmV3QXV0b21hdGlvbicsIChhY3Rpb24sIG9wdGlvbnMsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcmltYXJ5QnV0dG9uQWN0aW9uVmlld0l0ZW0sIHVuZGVmaW5lZCwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHR9KSk7XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKEF1dG9tYXRpb25zQ3VzdG9tVmlld0NvbnRyaWJ1dGlvbi5JRCwgQXV0b21hdGlvbnNDdXN0b21WaWV3Q29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xuXG5jbGFzcyBQcmltYXJ5QnV0dG9uQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByaXZhdGUgYnV0dG9uOiBCdXR0b24gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoY29udGV4dDogdW5rbm93biwgYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKSB7XG5cdFx0c3VwZXIoY29udGV4dCwgYWN0aW9uLCBvcHRpb25zKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50ID0gY29udGFpbmVyO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LWNvbXBvc2l0ZS1iYXItbWV0YS1pdGVtJyk7XG5cdFx0Y29uc3QgYnV0dG9uID0gdGhpcy5idXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGNvbnRhaW5lciwgeyBzZWNvbmRhcnk6IGZhbHNlLCAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzIH0pKTtcblx0XHRidXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb25hY28tdGV4dC1idXR0b24nLCAnY2hhdC1jb21wb3NpdGUtYmFyLW1ldGEtaXRlbS1idXR0b24nKTtcblx0XHR0aGlzLl9yZWdpc3RlcihidXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fYWN0aW9uLmVuYWJsZWQpIHtcblx0XHRcdFx0dGhpcy5hY3Rpb25SdW5uZXIucnVuKHRoaXMuX2FjdGlvbiwgdGhpcy5fY29udGV4dCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudXBkYXRlTGFiZWwoKTtcblx0XHR0aGlzLnVwZGF0ZUVuYWJsZWQoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQgeyB0aGlzLmJ1dHRvbj8uZm9jdXMoKTsgfVxuXHRvdmVycmlkZSBibHVyKCk6IHZvaWQgeyBpZiAodGhpcy5idXR0b24pIHsgdGhpcy5idXR0b24uZWxlbWVudC50YWJJbmRleCA9IC0xOyB0aGlzLmJ1dHRvbi5lbGVtZW50LmJsdXIoKTsgfSB9XG5cdG92ZXJyaWRlIHNldEZvY3VzYWJsZShmb2N1c2FibGU6IGJvb2xlYW4pOiB2b2lkIHsgaWYgKHRoaXMuYnV0dG9uKSB7IHRoaXMuYnV0dG9uLmVsZW1lbnQudGFiSW5kZXggPSBmb2N1c2FibGUgPyAwIDogLTE7IH0gfVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVFbmFibGVkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmJ1dHRvbikgeyB0aGlzLmJ1dHRvbi5lbmFibGVkID0gdGhpcy5fYWN0aW9uLmVuYWJsZWQ7IH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVMYWJlbCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuYnV0dG9uKSB7IHJldHVybjsgfVxuXHRcdERPTS5yZXNldCh0aGlzLmJ1dHRvbi5lbGVtZW50LCB0aGlzLl9hY3Rpb24ubGFiZWwpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBOZXdBdXRvbWF0aW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3Lm5ld0F1dG9tYXRpb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbmV3QXV0b21hdGlvbicsIFwiTmV3IEF1dG9tYXRpb25cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRBdXRvbWF0aW9uc0VuYWJsZWRDb250ZXh0LFxuXHRcdFx0bWVudTogW3sgaWQ6IE1lbnVzLkN1c3RvbVZpZXdBdXRvbWF0aW9ucywgZ3JvdXA6ICduYXZpZ2F0aW9uJywgb3JkZXI6IDEsIHdoZW46IENoYXRBdXRvbWF0aW9uc0VuYWJsZWRDb250ZXh0IH1dLFxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXRvbWF0aW9uRGlhbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1dG9tYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGlzRW5hYmxlZCA9ICgpID0+IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENIQVRfQVVUT01BVElPTlNfRU5BQkxFRF9TRVRUSU5HKSA9PT0gdHJ1ZTtcblx0XHRpZiAoIWlzRW5hYmxlZCgpKSB7XG5cdFx0XHRhd2FpdCBzaG93QXV0b21hdGlvbnNEaXNhYmxlZChkaWFsb2dTZXJ2aWNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXV0b21hdGlvbkRpYWxvZ1NlcnZpY2Uuc2hvd0F1dG9tYXRpb25EaWFsb2coe30pO1xuXHRcdGlmICghcmVzdWx0IHx8IHJlc3VsdC5raW5kICE9PSAnY3JlYXRlJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIWlzRW5hYmxlZCgpKSB7XG5cdFx0XHRhd2FpdCBzaG93QXV0b21hdGlvbnNEaXNhYmxlZChkaWFsb2dTZXJ2aWNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGF1dG9tYXRpb25TZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24ocmVzdWx0LnZhbHVlLCAoKSA9PiB7XG5cdFx0XHRcdGlmICghaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2F1dG9tYXRpb25zRGlzYWJsZWRCZWZvcmVTYXZlJywgXCJBdXRvbWF0aW9ucyB3ZXJlIGRpc2FibGVkIGJlZm9yZSB0aGUgY2hhbmdlIGNvdWxkIGJlIHNhdmVkLlwiKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0bG9nU2VydmljZS5lcnJvcignW0F1dG9tYXRpb25zXSBGYWlsZWQgdG8gY3JlYXRlIGF1dG9tYXRpb24nLCBlcnIpO1xuXHRcdFx0YXdhaXQgZGlhbG9nU2VydmljZS5lcnJvcihcblx0XHRcdFx0bG9jYWxpemUoJ2F1dG9tYXRpb25DcmVhdGVGYWlsZWQnLCBcIkZhaWxlZCB0byBjcmVhdGUgYXV0b21hdGlvbi5cIiksXG5cdFx0XHRcdGdldEVycm9yTWVzc2FnZShlcnIpLFxuXHRcdFx0KTtcblx0XHR9XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQWlCLG9CQUFvQjtBQUMxRCxTQUFTLFNBQVMsaUJBQW1ELHVCQUF1QjtBQUM1RixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0NBQWtDLHFDQUFxQztBQUNoRixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGNBQWM7QUFDdkIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxTQUFTLGFBQWEsc0JBQXNCO0FBQ3JELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0NBQWtDO0FBRTNDLFNBQVMsV0FBVztBQUVwQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdDQUFnQyxzQkFBc0I7QUFDL0QsU0FBUyxhQUFh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
